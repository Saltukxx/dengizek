// ---------------------------------------------------------------------------
// Eval ortak altyapısı — canlı sohbet rotasıyla AYNI akıştan tek tur çalıştırır
// ve model konuştuğunda hakem modelle cevabın otel verisine sadakatini puanlar.
// Kullananlar: golden-questions.eval.ts, imported-hotels.eval.ts.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { APICallError, generateText, stepCountIs, type ModelMessage } from "ai";
import { CHAT_PROVIDER_OPTIONS, getChatModel } from "@/lib/ai/llm";
import {
  buildAuthoritativeContext,
  buildSystemPrompt,
  buildTools,
  runServerTools,
  toModelMessages,
  triggerInstruction,
  type AuthoritativeContext,
  type ChatRequest,
} from "@/app/api/tour/chat/route";
import { cardPointerReplacement, hasOnlyFramingSentences, serverTurnText } from "@/lib/ai/response-guard";
import { windowConversationHistory } from "@/lib/ai/history-window";
import type { Fixture } from "./fixtures";

// ---------------------------------------------------------------------------
// Hakem — model cevabı otel verisine sadık mı?
// ---------------------------------------------------------------------------

export interface Verdict {
  grounded: boolean;
  claim?: string;
  /** Hakemlik yapan model; "kural" = somut iddia yok, hakeme gerek kalmadı. */
  judge?: string;
  /** Hakem çalışamadı (kota) — sonuç BEKLİYOR, geçti sayılmaz. */
  skipped?: boolean;
  /** Karar önbellekten geldi. */
  cached?: boolean;
}

/** Misafire gösterilen kart (fact ya da fiyat). */
export interface ShownCard {
  title?: string;
  text: string;
}

/**
 * Hakem, rehberden daha güçlü bir model olmalı: Flash-Lite hakem olarak
 * kaynakta yazan ifadeleri (ör. "2019'da restore edilen lobi") uydurma sandı.
 * Bu yüzden kota dolunca rehber modeline DÜŞÜLMEZ; sonuç "bekliyor" kalır.
 */
const JUDGE_MODEL = process.env.AI_JUDGE_MODEL?.trim() || "gemini-3.5-flash";

/**
 * Hakem kararları önbelleği: aynı soru + cevap + kart + kaynak bir daha
 * hakeme gitmez. Ücretsiz katmanda güçlü hakem günde ~20 istek; tekrar
 * koşularda yalnız yeni cevaplar denetlenir. Yalnız yerel (gitignore).
 */
const CACHE_FILE = path.resolve(process.cwd(), ".eval-cache/judge.json");
let cache: Record<string, Verdict> | null = null;

function loadCache(): Record<string, Verdict> {
  if (cache) return cache;
  try {
    cache = existsSync(CACHE_FILE) ? (JSON.parse(readFileSync(CACHE_FILE, "utf-8")) as Record<string, Verdict>) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function saveVerdict(key: string, verdict: Verdict): void {
  const store = loadCache();
  store[key] = verdict;
  mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(store, null, 1));
}

function groundingSource(data: AuthoritativeContext): string {
  const facts = (data.fullFactCatalog ?? data.factCatalog).map((f) => `- ${f.hint}: ${f.text}`).join("\n");
  const steps = data.availableSteps
    .map((s) =>
      [`- Adım "${s.title}"`, s.aiDescription, s.aiTags?.join(", "), s.aiPromo?.join("; ")].filter(Boolean).join(" | "),
    )
    .join("\n");
  const rooms = data.roomOptions.map((r) => `- Oda: ${r.name}`).join("\n");
  return `OTEL: ${data.hotelName}\n\nDOĞRULANMIŞ BİLGİLER:\n${facts}\n\nTUR ADIMLARI:\n${steps}\n\nODALAR:\n${rooms}`;
}

/** Turda gösterilen kartlar: fact kartı ve fiyat kartı satırları. */
export function shownCards(tools: ToolUse[]): ShownCard[] {
  const cards: ShownCard[] = [];
  for (const tool of tools) {
    const out = tool.output as
      | { card?: { title?: string; text?: string }; cards?: Array<{ roomName: string; lines: Array<{ label: string; value: string }> }> }
      | undefined;
    if (out?.card?.text) cards.push({ title: out.card.title, text: out.card.text });
    for (const card of out?.cards ?? []) {
      cards.push({ title: card.roomName, text: card.lines.map((l) => `${l.label}: ${l.value}`).join(" · ") });
    }
  }
  return cards;
}

export async function judgeGrounding(
  data: AuthoritativeContext,
  question: string,
  answer: string,
  cards: ShownCard[] = [],
): Promise<Verdict> {
  // Yalnız karta yönlendirme / soru / nezaket: denetlenecek somut iddia yok.
  // (Karta yönlendirmenin YANILTICI olup olmadığı ayrı, kural tabanlı kontrol:
  // isMisleadingCardPointer.)
  if (hasOnlyFramingSentences(answer)) return { grounded: true, judge: "kural" };

  const cardBlock = cards.length
    ? cards.map((c) => `- ${c.title ? `${c.title}: ` : ""}${c.text}`).join("\n")
    : "(kart gösterilmedi)";

  const prompt = `Bir otel sanal tur rehberinin cevabını denetliyorsun.

${groundingSource(data)}

MİSAFİR SORUSU: ${question}

MİSAFİRE GÖSTERİLEN KARTLAR (otelin verisinden, cevabın altında görünür):
${cardBlock}

REHBER CEVABI: ${answer}

Görev: Cevaptaki her SOMUT iddiayı tek tek yukarıdaki bilgilerle karşılaştır.
Somut iddia: var olduğu söylenen bir olanak/hizmet/mekan/eşya, saat, rakam,
mesafe, fiyat, kural, tarih.
İddia SAYILMAZ: selamlaşma, nezaket, soru sorma, öneri ("sahile geçelim mi?"),
"bilmiyorum/otele sorayım", genel övgü ("harika manzara", "çok beğeniliyor"),
tur adımlarının ya da odaların adını anmak, misafiri gösterilen karta
yönlendirmek ("detayları aşağıda görebilirsiniz", "bilgiyi kartta paylaştım").
Aynı bilginin başka kelimelerle, başka dilde ya da Türkçe karakter olmadan
yazılmış hali ("ozel kumsal" = "özel kumsal") kaynakta VAR sayılır.

Kaynakta karşılığı olmayan tek bir somut iddia bile varsa grounded=false.
Yalnızca JSON döndür: {"grounded": true} veya {"grounded": false, "claim": "<kaynakta olmayan iddia>"}`;

  const key = createHash("sha256").update(`${JUDGE_MODEL}\n${prompt}`).digest("hex").slice(0, 32);
  const hit = loadCache()[key];
  if (hit) return { ...hit, cached: true };

  const provider = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const result = await generateText({ model: provider(JUDGE_MODEL), prompt, temperature: 0, maxOutputTokens: 2000, maxRetries: 1 });
    const json = result.text.match(/\{[\s\S]*\}/)?.[0];
    let verdict: Verdict;
    try {
      verdict = { ...(JSON.parse(json ?? "") as Verdict), judge: JUDGE_MODEL };
    } catch {
      // Okunamayan hakem cevabı önbelleğe yazılmaz; bir sonraki koşuda yeniden denenir.
      return { grounded: true, skipped: true, claim: `hakem cevabı okunamadı: ${result.text.slice(0, 120)}` };
    }
    saveVerdict(key, verdict);
    return verdict;
  } catch (error) {
    if (!APICallError.isInstance(error) && !/quota|429|RetryError/i.test(String(error))) throw error;
    return { grounded: true, skipped: true };
  }
}

// ---------------------------------------------------------------------------
// Tek tur — canlı rotanın akışı
// ---------------------------------------------------------------------------

export interface ToolUse {
  toolName: string;
  input: Record<string, unknown>;
  output?: unknown;
}

export interface TurnResult {
  data: AuthoritativeContext;
  text: string;
  tools: ToolUse[];
  reply?: "unknown" | "contact" | "askDates" | "rooms";
  modelSpoke: boolean;
  inputTokens: number;
  outputTokens: number;
}

export async function runTurn(fixture: Fixture): Promise<TurnResult> {
  // Tetikleyici turlarda tarayıcı "[HIDDEN]" gönderir (bkz. use-tour-guide).
  const userText = fixture.trigger ? "[HIDDEN]" : fixture.message;
  const uiMessages = [...(fixture.history ?? []), { role: "user", parts: [{ type: "text", text: userText }] }];
  const request = {
    hotelSlug: fixture.hotel,
    tourId: fixture.tour,
    currentStepId: fixture.currentStepId ?? "s1",
    stepsSeen: fixture.stepsSeen ?? [fixture.currentStepId ?? "s1"],
    triggerReason: fixture.trigger ?? "userMessage",
    isAutoTour: false,
    browserLocale: fixture.browserLocale,
    messages: uiMessages,
  } as unknown as ChatRequest;

  const data = await buildAuthoritativeContext(request);
  if (!data) throw new Error(`${fixture.hotel}/${fixture.tour} turu bulunamadı`);

  const flags = { hadPriceTool: false, hadFactTool: false };
  const turn = await runServerTools(data, flags);
  const language = data.detectedLanguage ?? data.hotelProfile?.language;
  const serverTools: ToolUse[] = (turn?.runs ?? []).map((r) => ({
    toolName: r.toolName,
    input: r.input as Record<string, unknown>,
    output: r.output,
  }));

  const fixed = turn ? serverTurnText(turn, language) : null;
  if (fixed !== null && turn) {
    return { data, text: fixed, tools: serverTools, reply: turn.reply, modelSpoke: false, inputTokens: 0, outputTokens: 0 };
  }

  // Sunucu turu değil: model konuşur (serbest sohbet ya da tur anlatımı).
  const messages = windowConversationHistory(await toModelMessages(uiMessages));
  const instruction = triggerInstruction(data);
  if (instruction) messages.push({ role: "user", content: instruction });
  const tools = buildTools(data, flags);
  const result = await generateText({
    model: getChatModel()!,
    system: buildSystemPrompt(data),
    messages: messages as ModelMessage[],
    temperature: 0.3,
    tools,
    stopWhen: stepCountIs(2),
    maxOutputTokens: 350,
    providerOptions: CHAT_PROVIDER_OPTIONS,
  });
  const modelTools: ToolUse[] = result.steps.flatMap((step) =>
    step.toolCalls.map((call) => ({
      toolName: call.toolName,
      input: call.input as Record<string, unknown>,
      output: step.toolResults.find((r) => r.toolCallId === call.toolCallId)?.output,
    })),
  );
  // Canlıdaki createCardPointerTransform ile aynı kural: kart aldıktan sonra
  // yazılan son metin bloğu boş bir "aşağıda" cümlesiyse kartın cümlesiyle değişir.
  const cards = modelTools
    .filter((t) => t.toolName === "citeFact")
    .map((t) => (t.output as { card?: { title?: string; text?: string } } | undefined)?.card)
    .filter((c): c is { title?: string; text: string } => Boolean(c?.text));
  const lastStepText = result.steps.at(-1)?.text ?? "";
  const replaced = cards.length && data.lastUserMessage ? cardPointerReplacement(lastStepText, cards, data.lastUserMessage, language) : null;
  const text = replaced ? result.text.replace(lastStepText, replaced) : result.text;
  return {
    data,
    text,
    tools: [...serverTools, ...modelTools],
    modelSpoke: true,
    inputTokens: result.usage.inputTokens ?? 0,
    outputTokens: result.usage.outputTokens ?? 0,
  };
}

// ---------------------------------------------------------------------------
// AI rehber eval — GERÇEK Gemini çağrısı yapar.
//
// Normal `npm test`'e dahil DEĞİLDİR (bkz. vitest.eval.config.mts).
// Çalıştırmak için: `npm run test:eval` — GEMINI_API_KEY ve seed'lenmiş bir
// DATABASE_URL gerekir (bkz. src/lib/db/seed.ts). Soru seti: fixtures.ts.
//
// Her soru canlı rotayla AYNI akıştan geçer: bağlam → sunucu araçları
// (runServerTools) → sabit metin ya da model. Model konuştuğunda ikinci bir
// Gemini çağrısı ("hakem") cevabın otel verisinin dışında iddia içerip
// içermediğini puanlar.
//
// Çıktı: eval-metrics.json (süre, token, hakem sonuçları).
// ---------------------------------------------------------------------------

import { writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, stepCountIs, type ModelMessage } from "ai";
import { CHAT_PROVIDER_OPTIONS, chatModelId, getChatModel } from "@/lib/ai/llm";
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
import { serverTurnText, textContainsPriceLikeContent } from "@/lib/ai/response-guard";
import { windowConversationHistory } from "@/lib/ai/history-window";
import { fixtures, type Fixture } from "./fixtures";

// ---------------------------------------------------------------------------
// Hakem — model cevabı otel verisine sadık mı?
// ---------------------------------------------------------------------------

interface Verdict {
  grounded: boolean;
  claim?: string;
}

/**
 * Hakem, rehberden daha güçlü bir model olmalı: Flash-Lite hakem olarak
 * kaynakta yazan ifadeleri (ör. "2019'da restore edilen lobi") uydurma sandı.
 */
const JUDGE_MODEL = process.env.AI_JUDGE_MODEL?.trim() || "gemini-3.5-flash";

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

async function judgeGrounding(data: AuthoritativeContext, question: string, answer: string): Promise<Verdict> {
  const prompt = `Bir otel sanal tur rehberinin cevabını denetliyorsun.

${groundingSource(data)}

MİSAFİR SORUSU: ${question}
REHBER CEVABI: ${answer}

Görev: Cevaptaki her SOMUT iddiayı tek tek yukarıdaki bilgilerle karşılaştır.
Somut iddia: var olduğu söylenen bir olanak/hizmet/mekan/eşya, saat, rakam,
mesafe, fiyat, kural, tarih.
İddia SAYILMAZ: selamlaşma, nezaket, soru sorma, öneri ("sahile geçelim mi?"),
"bilmiyorum/otele sorayım", genel övgü ("harika manzara", "çok beğeniliyor"),
tur adımlarının ya da odaların adını anmak.
Aynı bilginin başka kelimelerle, başka dilde ya da Türkçe karakter olmadan
yazılmış hali ("ozel kumsal" = "özel kumsal") kaynakta VAR sayılır.

Kaynakta karşılığı olmayan tek bir somut iddia bile varsa grounded=false.
Yalnızca JSON döndür: {"grounded": true} veya {"grounded": false, "claim": "<kaynakta olmayan iddia>"}`;

  const judge = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY })(JUDGE_MODEL);
  const result = await generateText({ model: judge, prompt, temperature: 0, maxOutputTokens: 2000 });
  const json = result.text.match(/\{[\s\S]*\}/)?.[0];
  try {
    return JSON.parse(json ?? "") as Verdict;
  } catch {
    return { grounded: false, claim: `hakem cevabı okunamadı: ${result.text.slice(0, 120)}` };
  }
}

// ---------------------------------------------------------------------------
// Tek tur — canlı rotanın akışı
// ---------------------------------------------------------------------------

interface ToolUse {
  toolName: string;
  input: Record<string, unknown>;
  output?: unknown;
}

interface TurnResult {
  data: AuthoritativeContext;
  text: string;
  tools: ToolUse[];
  reply?: "unknown" | "contact";
  modelSpoke: boolean;
  inputTokens: number;
  outputTokens: number;
}

async function runTurn(fixture: Fixture): Promise<TurnResult> {
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
  return {
    data,
    text: result.text,
    tools: [...serverTools, ...modelTools],
    modelSpoke: true,
    inputTokens: result.usage.inputTokens ?? 0,
    outputTokens: result.usage.outputTokens ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Eval
// ---------------------------------------------------------------------------

interface FixtureMetric {
  id: string;
  hotel: string;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  tools: string[];
  modelSpoke: boolean;
  text: string;
  verdict?: Verdict;
}

const metrics: FixtureMetric[] = [];

describe(`AI rehber eval (${fixtures.length} soru, gerçek model)`, () => {
  beforeAll(() => {
    if (!getChatModel()) throw new Error("GEMINI_API_KEY tanımlı değil — .env.local'a ekleyin.");
  });

  afterAll(() => {
    const spoke = metrics.filter((m) => m.verdict);
    writeFileSync(
      "eval-metrics.json",
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          model: chatModelId(),
          fixtureCount: metrics.length,
          modelTurns: spoke.length,
          ungrounded: spoke.filter((m) => !m.verdict?.grounded).map((m) => ({ id: m.id, claim: m.verdict?.claim, text: m.text })),
          totalTokens: metrics.reduce((s, m) => s + m.inputTokens + m.outputTokens, 0),
          avgDurationMs: metrics.length ? Math.round(metrics.reduce((s, m) => s + m.durationMs, 0) / metrics.length) : 0,
          fixtures: metrics,
        },
        null,
        2,
      ),
    );
  });

  for (const fixture of fixtures) {
    it(fixture.id, async () => {
      const started = Date.now();
      const turn = await runTurn(fixture);
      const metric: FixtureMetric = {
        id: fixture.id,
        hotel: fixture.hotel,
        durationMs: Date.now() - started,
        inputTokens: turn.inputTokens,
        outputTokens: turn.outputTokens,
        tools: turn.tools.map((t) => t.toolName),
        modelSpoke: turn.modelSpoke,
        text: turn.text,
      };
      metrics.push(metric);

      const e = fixture.expect;
      const called = new Set(turn.tools.map((t) => t.toolName));
      const describeTurn = `araçlar: ${[...called].join(", ") || "yok"} | metin: ${turn.text.slice(0, 160)}`;

      for (const name of e.tools ?? []) {
        expect(called.has(name), `beklenen araç çağrılmadı: ${name} (${describeTurn})`).toBe(true);
      }
      for (const name of e.notTools ?? []) {
        expect(called.has(name), `çağrılmaması gereken araç: ${name} (${describeTurn})`).toBe(false);
      }

      const cited = turn.tools.filter((t) => t.toolName === "citeFact").map((t) => String(t.input.factId));
      if (e.factIds) {
        expect(cited.length > 0 && cited.every((id) => e.factIds!.includes(id)), `factId ${cited.join(",") || "yok"} ∉ [${e.factIds.join(", ")}]`).toBe(true);
      }
      if (e.unknownOrFacts) {
        const ok = turn.reply === "unknown" || (cited.length > 0 && cited.every((id) => e.unknownOrFacts!.includes(id)));
        expect(ok, `ne "bilgim yok" ne beklenen kart (${describeTurn})`).toBe(true);
      }
      if (e.reply) expect(turn.reply, describeTurn).toBe(e.reply);

      const price = turn.tools.find((t) => t.toolName === "getRoomPrice")?.input;
      if (e.price) expect(price, describeTurn).toMatchObject(e.price);
      for (const key of e.priceAbsent ?? []) expect(price?.[key], `fiyat sorgusunda ${key} olmamalı`).toBeUndefined();

      if (e.steps) {
        const stepId = turn.tools.find((t) => t.toolName === "navigateTo")?.input.stepId;
        expect(e.steps, describeTurn).toContain(stepId);
      }
      if (e.inquiryBlocked !== undefined) {
        const inquiry = turn.tools.find((t) => t.toolName === "openInquiry");
        if (inquiry) expect((inquiry.output as { blocked?: boolean } | undefined)?.blocked === true).toBe(e.inquiryBlocked);
        else if (e.inquiryBlocked === false) expect.fail(`openInquiry çağrılmadı (${describeTurn})`);
      }

      // Metinde asla fiyat yok — fiyat yalnız kartta.
      expect(textContainsPriceLikeContent(turn.text), `metinde fiyat: ${turn.text}`).toBe(false);

      // Model konuştuysa hakem: otel verisi dışında iddia var mı?
      if (turn.modelSpoke && turn.text.trim()) {
        metric.verdict = await judgeGrounding(turn.data, fixture.message || `(tur tetikleyicisi: ${fixture.trigger})`, turn.text);
        expect(metric.verdict.grounded, `uydurma: ${metric.verdict.claim} | metin: ${turn.text}`).toBe(true);
      }
    });
  }
});

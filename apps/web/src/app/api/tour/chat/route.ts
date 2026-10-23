import { NextResponse } from "next/server";
import { z } from "zod";
import { getTourManifest } from "@/lib/mocks/hotels";
import { getHotelAiProfile } from "@/lib/db/ai-context";
import { buildFactCatalog, citeFactById, formatCatalogForPrompt } from "@/lib/ai/fact-store";
import { queryRoomPrices } from "@/lib/ai/price-engine";
import {
  computeCompletionState,
  shouldAllowOpenInquiry,
  shouldAllowOpenInquiryAsync,
} from "@/lib/ai/completion-engine";
import { filterRelevantFacts } from "@/lib/ai/context-router";
import { embedText } from "@/lib/ai/embeddings";
import { windowConversationHistory } from "@/lib/ai/history-window";
import { detectLanguageHint } from "@/lib/ai/language-detect";
import {
  buildToolHintPrompt,
  createGuardStreamTransform,
  decideToolChoice,
  serverTurnText,
  detectToolHints,
} from "@/lib/ai/response-guard";
import type { AiFactCatalogEntry } from "@/lib/ai/types";
import type { CompletionState } from "@/lib/ai/completion-engine";
import { getHotelIdBySlug, getPublishedHotelContent } from "@/lib/hotels-repo";
import { trackEvent } from "@/lib/analytics";
import { checkAiBudget } from "@/lib/ai/budget";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { apiRateLimited, apiNotFound, apiServiceUnavailable } from "@/lib/api-response";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  tool,
  type ModelMessage,
} from "ai";
import { CHAT_PROVIDER_OPTIONS, chatModelId, getChatModel } from "@/lib/ai/llm";
import {
  extractConversationContext,
  planServerTools,
  type PlannedToolCall,
} from "@/lib/ai/deterministic-tools";
import { hasInquiryIntent, hasInquiryIntentSemantic } from "@/lib/ai/completion-engine";
import { todayIso } from "@/lib/price";

// Fonksiyon üst sınırı — takılı bir model stream'i isteği süresiz
// kilitleyemesin. Model çağrısının kendi iptali aşağıda AbortSignal.timeout
// ile daha erken kesilir. Gerekirse AI_STREAM_TIMEOUT_MS ile ayarlanır
// (maxDuration'ı aşmamalı).
export const maxDuration = 60;
const STREAM_TIMEOUT_MS = (() => {
  const raw = Number(process.env.AI_STREAM_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 && raw <= 58_000 ? raw : 45_000;
})();
/** Tool çağrısı + ardından anlatım için 2 adım yeterli (bkz. stopWhen). */
const MAX_MODEL_STEPS = 2;
/** Adım başına en fazla üretilecek token (araç çağrısı JSON'u dahil). */
const MAX_OUTPUT_TOKENS = 350;

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

const triggerReasonValues = [
  "tourStart",
  "stepStart",
  "stepEnd",
  "idle",
  "userMessage",
  "autoTourNext",
] as const;

interface AvailableStep {
  stepId: string;
  title: string;
  aiTags?: string[];
  aiDescription?: string;
  aiPromo?: string[];
}

const completionMetaSchema = z.object({
  progressRatio: z.number().min(0).max(1),
  nextStepId: z.string().nullable(),
});

// İstemciden gelen mesajlar: rol yalnızca user/assistant olabilir — "system"
// rolü reddedilir ki istemci system-prompt enjekte edemesin. Parça iç yapısı
// (tool parts vb.) SDK sürümleri arasında değiştiği için loose bırakılır;
// boyut sınırları aşağıdaki bütçe kontrolleriyle uygulanır.
const chatMessageSchema = z.looseObject({
  role: z.enum(["user", "assistant"]),
  content: z.union([z.string(), z.array(z.unknown()).max(30)]).optional(),
  parts: z.array(z.looseObject({ type: z.string().max(64) })).max(30).optional(),
});

const MAX_MESSAGES = 80;
const MAX_TOTAL_TEXT_CHARS = 24_000;

/** Mesajlardaki toplam metin karakteri — string content + text part'ları sayar. */
export function totalMessageTextChars(messages: z.infer<typeof chatMessageSchema>[]): number {
  let total = 0;
  for (const m of messages) {
    if (typeof m.content === "string") total += m.content.length;
    else if (Array.isArray(m.content)) {
      for (const part of m.content) {
        const text = (part as { text?: unknown })?.text;
        if (typeof text === "string") total += text.length;
      }
    }
    for (const part of m.parts ?? []) {
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") total += text.length;
    }
  }
  return total;
}

export const requestSchema = z.object({
  messages: z
    .array(chatMessageSchema)
    .min(1)
    .max(MAX_MESSAGES)
    .refine((msgs) => totalMessageTextChars(msgs) <= MAX_TOTAL_TEXT_CHARS, {
      message: "Mesaj geçmişi çok uzun.",
    }),
  hotelSlug: z.string().min(1).max(120),
  tourId: z.string().min(1).max(120),
  currentStepId: z.string().min(1).max(120),
  stepsSeen: z.array(z.string().max(120)).max(200),
  // Varsa sunucudaki misafir oturumu da okunur (bkz. resolveStepsSeen) —
  // ilerleme kapıları yalnızca istemcinin beyanına bırakılmaz.
  sessionToken: z.string().min(10).max(128).optional(),
  triggerReason: z.enum(triggerReasonValues),
  isAutoTour: z.boolean(),
  completionMeta: completionMetaSchema.optional(),
  // Yalnızca UX ipucu (dil tespiti belirsiz kaldığında) — asla otoriter
  // değil, güvenlikle ilgili hiçbir karar buna dayanmaz.
  browserLocale: z.string().max(35).optional(),
});

export type ChatRequest = z.infer<typeof requestSchema>;

export interface AuthoritativeContext extends ChatRequest {
  availableSteps: AvailableStep[];
  /** Yayınlanmış otel adı — yoksa slug'dan türetilen başlık kullanılır. */
  hotelName: string;
  hotelProfile: {
    aiPersona?: string;
    language?: string;
  } | undefined;
  /** Prompt'a giren, mesaja göre süzülmüş katalog (en fazla 15). */
  factCatalog: AiFactCatalogEntry[];
  /** Otelin tüm fact kataloğu — sunucu tarafı fact seçimi ve citeFact doğrulaması için. */
  fullFactCatalog?: AiFactCatalogEntry[];
  roomOptions: { slug: string; name: string }[];
  completion: CompletionState;
  lastUserMessage?: string;
  userMessageEmbedding: number[] | null;
  /** Bu turda tespit edilen dil (BCP-47 kısa kod) — yoksa hotelProfile.language varsayılan kalır. */
  detectedLanguage?: string;
}

/**
 * Son kullanıcı mesajının metni. Hem ModelMessage ({ content }) hem de
 * tarayıcının gönderdiği UI mesajı ({ parts }) biçimini okur — useChat
 * mesajları parts ile gönderir; yalnız content'e bakmak canlıda mesajı
 * hiç görmemek demektir.
 */
function extractLastUserMessage(messages: unknown[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i] as { role?: string; content?: unknown; parts?: unknown } | undefined;
    if (m?.role !== "user") continue;
    if (typeof m.content === "string") {
      if (m.content !== "[HIDDEN]") return m.content;
      continue;
    }
    const parts = Array.isArray(m.content) ? m.content : Array.isArray(m.parts) ? m.parts : [];
    const text = (parts as Array<{ type?: string; text?: unknown }>)
      .filter((p) => p?.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string)
      .join("");
    if (text && text !== "[HIDDEN]") return text;
  }
  return undefined;
}

export function buildSystemPrompt(req: AuthoritativeContext): string {
  const {
    hotelProfile,
    availableSteps,
    currentStepId,
    stepsSeen,
    triggerReason,
    isAutoTour,
    factCatalog,
    roomOptions,
    completion,
  } = req;

  const persona = hotelProfile?.aiPersona ?? "Yapay Zeka Rehberi";
  const hotelName = req.hotelName;

  const stepsNotSeen = availableSteps
    .filter((s) => !stepsSeen.includes(s.stepId))
    .map((s) => s.stepId);

  const currentStep = availableSteps.find((s) => s.stepId === currentStepId);

  const stepsContext = availableSteps
    .map(
      (s) =>
        `- stepId: "${s.stepId}" | başlık: "${s.title}"` +
        (s.aiTags?.length ? ` | etiketler: ${s.aiTags.join(", ")}` : "") +
        (s.aiDescription ? ` | açıklama: ${s.aiDescription}` : "") +
        (s.aiPromo?.length ? ` | öne çıkanlar: ${s.aiPromo.join("; ")}` : ""),
    )
    .join("\n");

  const catalogBlock = formatCatalogForPrompt(factCatalog);

  const roomBlock = roomOptions.length
    ? roomOptions.map((r) => `- ${r.slug}: ${r.name}`).join("\n")
    : "(Oda listesi yok)";

  const progressPct = Math.round(completion.progressRatio * 100);
  const nextStepLine = completion.nextStepId
    ? `Sıradaki adım (sunucu): "${completion.nextStepId}" — ${completion.nextStepTitle ?? ""}. Bu ID'yi tahmin etme; autoTourNext/navigateTo'da bunu kullan.`
    : "Tüm adımlar görüldü — tur tamamlandı sayılır.";

  const inquiryGate = shouldAllowOpenInquiry(completion.progressRatio, req.lastUserMessage)
    ? "Tur yeterince ilerledi veya kullanıcı açıkça talep istedi — openInquiry kullanılabilir."
    : "Tur %80 tamamlanmadan openInquiry ÇAĞIRMA (kullanıcı açıkça rezervasyon/talep istemedikçe).";

  let toolHints = "";
  if (triggerReason === "userMessage" && req.lastUserMessage) {
    const hints = detectToolHints(req.lastUserMessage);
    toolHints = buildToolHintPrompt(hints);
  }

  const baseLanguage = hotelProfile?.language ?? "tr";
  const effectiveLanguage = req.detectedLanguage ?? baseLanguage;
  const languageLine =
    effectiveLanguage === "tr"
      ? "Türkçe konuş."
      : `Kullanıcı "${effectiveLanguage}" dilinde yazdı — yanıtını o dilde ver (otelin varsayılan dili: ${baseLanguage}).`;
  const factSourceNote =
    effectiveLanguage !== "tr"
      ? "\n- Otel ifadeleri ve politikalar her zaman orijinal dilinde (Türkçe) gösterilir; sen yalnızca kısa çerçeve cümleni kullanıcının dilinde yaz, fact metnini çevirme."
      : "";

  // ---------------------------------------------------------------------
  // SIRALAMA KASITLI: sağlayıcı prompt caching'i yalnızca SABİT ÖNEK için
  // çalışır. Bir tur oturumu boyunca değişmeyen bloklar (persona, kurallar,
  // adım listesi, oda listesi) başa; her istekte değişenler (dil, araç ipucu,
  // ilerleme, bağlam, filtrelenmiş fact kataloğu) sona alınır. İçerik aynı,
  // yalnızca sıra farklı — böylece aynı turdaki ardışık çağrılarda girdi
  // token'larının büyük kısmı cache'ten gelir.
  // ---------------------------------------------------------------------
  const stablePrefix = `Sen ${persona}'sin — ${hotelName} otelinin sanal tur rehberisin.

KARAKTERİN:
- Sıcak, bilgili, samimi ama kısa konuş.
- Her yanıtta MAKS 1-2 cümle yaz; ardından gerekirse araç çağır.
- Birincil görev: henüz görülmemiş adımları nazikçe yönlendir; tur tamamlama öncelikli.

KESİN KURALLAR — FİYAT VE FACT:
- Serbest metinde ASLA fiyat, para birimi (₺/$/€), yüzde veya rakam yazma.
- Fiyat sorularında MUTLAKA getRoomPrice aracını kullan (bugün, tarih aralığı, kişi sayısı).
- Otel bilgisi sorularında MUTLAKA citeFact aracını kullan; yalnızca katalogdaki factId.
- citeFact sonucu kartta gösterilir; sen yalnızca kısa çerçeve cümlesi yaz.
- "Otel ifadesi" etiketli bilgiler tesis sahibinin ifadesidir; doğrulanmış bilgi değildir — kart etiketine güven.
- Bilmiyorsan uydurma; "Bu konuda otelden sizin için bilgi alabilirim." de.
- Bir alanı ya da oteli anlatırken YALNIZCA aşağıdaki adım açıklamalarını, öne çıkanları ve fact kataloğunu kullan. Listede olmayan özellik (jakuzi, balkon, manzara ayrıntısı), mesafe, hizmet veya sayı EKLEME; emin değilsen genel ve kısa konuş.

İLETİŞİM KURALI:
- Otelin telefonunu, e-postasını, web sitesini veya sosyal medya hesabını ASLA verme; bilmiyorsun ve tahmin etmezsin.
- Misafirden telefon ya da e-posta isteme. Rezervasyon ve soru için tek yol Dengizek talep formudur (openInquiry).

TUR KURALLARI:
- navigateTo'da sadece "Gezinebilir Adımlar" listesindeki stepId'leri kullan.
- Aynı öneriyi 2 kez reddeden kullanıcıya o konuyu bir daha açma.

GEZİNEBİLİR ADIMLAR:
${stepsContext}

ODALAR (getRoomPrice roomSlug):
${roomBlock}`;

  const serverToolLine = toolHints ? `\n${toolHints}\n` : "";

  const dynamicSuffix = `TARİH:
- Bugün: ${todayIso()} (YYYY-AA-GG). Yılı belirtilmeyen tarihleri buna göre yorumla.

DİL:
- ${languageLine}${factSourceNote}
${serverToolLine}
DURUM:
- ${inquiryGate}
- Tur ilerlemesi: ${completion.seenCount}/${completion.totalCount} (%${progressPct}).
- ${nextStepLine}
${isAutoTour ? "- ŞU AN OTOMATİK TUR AKTİF. Her adım bitince autoTourNext ile sunucunun verdiği sıradaki adıma geç, kısa narasyon ekle." : ""}

MEVCUT BAĞLAM:
- Şu anki adım: "${currentStep?.title ?? currentStepId}" (${currentStepId})${currentStep?.aiDescription ? `\n  Açıklama: ${currentStep.aiDescription}` : ""}
- Tetikleyici: ${triggerReason}
- Görülen adımlar: ${stepsSeen.length ? stepsSeen.join(", ") : "(henüz hiç)"}
- Henüz görülmeyenler: ${stepsNotSeen.length ? stepsNotSeen.join(", ") : "(hepsi gezildi)"}
- Otomatik tur: ${isAutoTour ? "AKTİF" : "pasif"}

FACT KATALOĞU (citeFact factId):
${catalogBlock}

Önce kısa cümle, sonra getRoomPrice veya citeFact çağır.`;

  return `${stablePrefix}\n\n${dynamicSuffix}`;
}

/**
 * Görülen adımların doğrulanmış listesi.
 *
 * İstemcinin gönderdiği stepsSeen tek başına otorite değildir — şişirilerek
 * openInquiry kapısı (%80 ilerleme) atlanabilir. sessionToken verilmişse
 * sunucudaki guest_sessions kaydıyla KESİŞİM alınır: istemci yalnızca
 * sunucunun da gördüğü adımları sayabilir. Kayıt yoksa/DB düşükse istemci
 * değeri korunur (tur akışı asla kırılmaz).
 */
async function resolveStepsSeen(req: ChatRequest): Promise<string[]> {
  if (!req.sessionToken) return req.stepsSeen;
  try {
    const { getDb, isDbConfigured } = await import("@/lib/db");
    if (!isDbConfigured()) return req.stepsSeen;
    const { guestSessionsTable } = await import("@/lib/db/schema");
    const { and, eq } = await import("drizzle-orm");
    const [row] = await getDb()
      .select({ stepsSeen: guestSessionsTable.stepsSeen })
      .from(guestSessionsTable)
      .where(
        and(
          eq(guestSessionsTable.sessionToken, req.sessionToken),
          eq(guestSessionsTable.hotelSlug, req.hotelSlug),
          eq(guestSessionsTable.tourId, req.tourId),
        ),
      )
      .limit(1);
    if (!row) return req.stepsSeen;
    const serverSeen = new Set(row.stepsSeen);
    return req.stepsSeen.filter((stepId) => serverSeen.has(stepId));
  } catch (err) {
    console.warn("[chat] guest_sessions okunamadı:", err);
    return req.stepsSeen;
  }
}

export async function buildAuthoritativeContext(req: ChatRequest): Promise<AuthoritativeContext | null> {
  const manifest = await getTourManifest(req.hotelSlug, req.tourId);
  if (!manifest) return null;

  const stepsSeen = await resolveStepsSeen(req);

  // Profil ve içerik bir kez okunur, katalog builder'a geçilir — cache miss
  // durumunda aynı isteğin 2× profil + 2× içerik okuması yapması önlenir.
  const [liveProfile, content] = await Promise.all([
    getHotelAiProfile(req.hotelSlug),
    getPublishedHotelContent(req.hotelSlug),
  ]);
  const fullCatalog = await buildFactCatalog(req.hotelSlug, {
    profile: liveProfile,
    content,
  });

  // snapshotProfile: tur yayına alınırken donmuş hotelProfile — getHotelAiProfile
  // (artık publishedSnapshot tabanlı) başarısız olursa (DB hatası vb.) son çare
  // olarak kullanılır. NOT: snapshotProfile.facts/.policies KASITLI OLARAK
  // okunmuyor — otel gerçekleri/politikaları tek doğru kaynak buildFactCatalog
  // olmalı; buradan okumak eski getHotelAiFacts gibi kontrolsüz bir ikinci yol
  // açar.
  const snapshotProfile = manifest.hotelProfile;
  const hotelProfile = {
    aiPersona:
      liveProfile?.aiPersona ??
      snapshotProfile?.aiPersona ??
      "Yapay Zeka Rehberi",
    language: liveProfile?.language ?? snapshotProfile?.language ?? "tr",
  };

  const availableSteps = manifest.steps
    .filter((s) => s.aiVisible !== false)
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      stepId: s.stepId,
      title: s.title,
      aiTags: s.aiTags,
      aiDescription: s.aiDescription,
      aiPromo: s.aiPromo,
    }));

  const currentStep = availableSteps.find((s) => s.stepId === req.currentStepId);
  const lastUserMessage =
    req.triggerReason === "userMessage"
      ? extractLastUserMessage(req.messages)
      : undefined;

  // Bu turun kullanıcı-mesajı embedding'i — hem fact retrieval (context-router)
  // hem openInquiry'nin embedding-destekli niyet kontrolü (completion-engine)
  // tarafından paylaşılır; tek embed API çağrısı.
  const userMessageEmbedding = lastUserMessage ? await embedText(lastUserMessage) : null;
  const detectedLanguage = lastUserMessage
    ? detectLanguageHint(lastUserMessage, req.browserLocale)
    : undefined;

  const factCatalog = await filterRelevantFacts(fullCatalog, req.hotelSlug, {
    userMessage: lastUserMessage,
    currentStepTags: currentStep?.aiTags,
    userMessageEmbedding,
  });

  const completion = computeCompletionState(
    availableSteps.map((s) => ({ stepId: s.stepId, title: s.title })),
    stepsSeen,
    req.currentStepId,
  );

  const fallbackHotelName = req.hotelSlug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return {
    ...req,
    // Doğrulanmış liste req.stepsSeen'i EZER — prompt ve kapılar bunu görür.
    stepsSeen,
    availableSteps,
    hotelName: content.name?.trim() || fallbackHotelName,
    hotelProfile,
    factCatalog,
    fullFactCatalog: fullCatalog,
    roomOptions: content.rooms.map((r) => ({ slug: r.slug, name: r.name })),
    completion,
    lastUserMessage,
    userMessageEmbedding,
    detectedLanguage,
  };
}

export type ToolFlags = { hadPriceTool: boolean; hadFactTool: boolean };

/**
 * Sohbet araçlarını kurar — hem POST route'u hem gerçek-model eval'ları
 * (src/lib/ai/evals) aynı tanımı kullanır, iki ayrı yol açılmasın diye.
 */
export function buildTools(data: AuthoritativeContext, toolFlags: ToolFlags) {
  const hotelSlug = data.hotelSlug;
  // Süzülmüş katalog yalnızca prompt'u kısaltır; citeFact otelin tüm
  // doğrulanmış kataloğunda arar (sunucu seçimi de oradan yapılır).
  const factCatalog = data.fullFactCatalog ?? data.factCatalog;
  return {
    navigateTo: tool({
      description: "Kullanıcıyı mevcut turda başka bir adıma yönlendir. Sadece availableSteps listesindeki stepId'leri kullan.",
      inputSchema: z.object({
        stepId: z.string().describe("Hedef adımın stepId'si"),
        reason: z.string().describe("Neden bu adıma geçildiğinin açıklaması"),
      }),
    }),
    suggestNext: tool({
      description: "Kullanıcıya chip olarak önerilecek seçenek belirle.",
      inputSchema: z.object({
        chips: z.array(z.string()).max(3).describe("Max 3 chip önerisi"),
      }),
    }),
    openInquiry: tool({
      description:
        "Rezervasyon / bilgi talep formunu aç. Yalnızca tur %80+ tamamlandıysa veya kullanıcı açıkça rezervasyon/talep istediğinde kullan.",
      inputSchema: z.object({
        roomSlug: z.string().optional().describe("Varsa oda slug'ı"),
      }),
      execute: async () => {
        const allowed = await shouldAllowOpenInquiryAsync(
          data.completion.progressRatio,
          data.lastUserMessage,
          data.userMessageEmbedding,
        );
        return allowed ? { ok: true as const } : { ok: false as const, blocked: true as const };
      },
    }),
    autoTourNext: tool({
      description: "Sadece isAutoTour=true iken kullan. Sunucunun verdiği sıradaki adıma geç.",
      inputSchema: z.object({
        stepId: z.string().describe("Sıradaki adımın stepId'si"),
        delayMs: z.number().default(2000).describe("Geçiş gecikmesi ms"),
      }),
    }),
    endAutoTour: tool({
      description: "Otomatik tur tamamlandığında çağır.",
      inputSchema: z.object({}),
    }),
    getRoomPrice: tool({
      description:
        "Otel oda fiyatlarını veritabanından getirir. Bugün/gecelik, checkIn-checkOut toplamı, guestCount (kişi sayısı) veya childAges (çocukların yaşları) destekler. Fiyatları serbest metinde yazma.",
      inputSchema: z.object({
        roomSlug: z.string().optional().describe("Oda slug; boşsa tüm odalar"),
        checkIn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Giriş YYYY-MM-DD"),
        checkOut: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Çıkış YYYY-MM-DD"),
        guestCount: z.number().int().min(1).max(12).optional().describe("Kişi sayısı"),
        childAges: z
          .array(z.number().int().min(0).max(17))
          .max(10)
          .optional()
          .describe("Çocukların yaşları — verilirse gecelik fiyata yaş bazlı ek/indirim uygulanır"),
      }),
      // toolFlags burada (çağrı anında) işaretlenir — guard transform'un
      // ihtiyaç duyduğu tek doğru kaynak budur, başka yerde tekrarlanmaz.
      execute: async (input) => {
        toolFlags.hadPriceTool = true;
        return queryRoomPrices(hotelSlug, input);
      },
    }),
    citeFact: tool({
      description:
        "Katalogdan doğrulanmış bilgi, politika veya otel ifadesi getirir. Metni kartta gösterilir.",
      inputSchema: z.object({
        factId: z.string().describe("FACT KATALOĞU id"),
      }),
      execute: async ({ factId }) => {
        toolFlags.hadFactTool = true;
        return citeFactById(hotelSlug, factId, factCatalog);
      },
    }),
  };
}

export interface ServerToolRun {
  toolCallId: string;
  toolName: PlannedToolCall["toolName"];
  input: PlannedToolCall["input"];
  output: unknown;
  /** Modele verilecek geçmiş: araç çağrısı + sonucu. */
  messages: ModelMessage[];
}

/**
 * İstemci (useChat) mesajları UI biçiminde gönderir: { role, parts: [...] }.
 * Model ise ModelMessage ister ({ role, content }). content taşıyan mesajlar
 * olduğu gibi kalır; parts taşıyanlar SDK'nın dönüştürücüsünden geçer.
 * Tarayıcıda çalışan araçların (navigateTo vb.) sonuçsuz çağrıları atlanır.
 */
export async function toModelMessages(raw: unknown[]): Promise<ModelMessage[]> {
  const out: ModelMessage[] = [];
  for (const item of raw as Array<{ role?: string; content?: unknown; parts?: unknown[] }>) {
    if (item?.content !== undefined) {
      out.push(item as ModelMessage);
      continue;
    }
    if (!Array.isArray(item?.parts) || (item.role !== "user" && item.role !== "assistant")) continue;
    try {
      out.push(
        ...(await convertToModelMessages([{ role: item.role, parts: item.parts } as never], {
          ignoreIncompleteToolCalls: true,
        })),
      );
    } catch (err) {
      // Bozuk/eski biçimli parça: yalnız metni koru, sohbeti kırma.
      console.warn("[chat] mesaj dönüştürülemedi, yalnız metin kullanılıyor:", err);
      const text = item.parts
        .map((p) => ((p as { type?: string; text?: unknown }).type === "text" ? String((p as { text?: unknown }).text ?? "") : ""))
        .join("");
      if (text) out.push({ role: item.role, content: text } as ModelMessage);
    }
  }
  return out;
}

/** Kullanıcı mesajı olmayan tetikleyiciler (tur başlangıcı, adıma geliş…) için model talimatı. */
export function triggerInstruction(data: AuthoritativeContext): string | null {
  if (data.triggerReason === "userMessage") return null;
  const triggerMap: Record<string, string> = {
    tourStart: "[SİSTEM] Tur başladı. Kullanıcıyı karşıla ve nereden başlamak istediğini sor. suggestNext ile 2-3 alan öner.",
    stepStart: `[SİSTEM] Kullanıcı "${data.currentStepId}" adımına geldi. Bu alanı yalnızca adım açıklamasındaki bilgilerle kısa tanıt.`,
    stepEnd: `[SİSTEM] "${data.currentStepId}" adımı bitti. Geçişi yorum yap ve henüz görülmemiş bir alan öner (navigateTo veya suggestNext).`,
    idle: "[SİSTEM] Kullanıcı 12 saniyedir hareketsiz. Hafif bir soru veya öneri ile meşgul et.",
    autoTourNext: `[SİSTEM] Otomatik tur devam ediyor. Sıradaki adım: ${data.completion.nextStepId ?? "yok"}. autoTourNext ile bu adıma geç.`,
  };
  return triggerMap[data.triggerReason] ?? null;
}

export interface ServerTurn {
  /** Sunucuda çalışan araçlar (kart sırasıyla). */
  runs: ServerToolRun[];
  /** unknown: katalog dışı soru · contact: iletişim bilgisi isteği — araç yok, sabit cevap. */
  reply?: "unknown" | "contact";
}

/**
 * Fiyat / bilgi / talep / gezinme sorularında araçları modelden ÖNCE sunucuda
 * çalıştırır. Fiyat ve bilgi kartı modelin insiyatifine bırakılmaz: model aracı
 * atlayıp bilgi uydurabilir (bkz. deterministic-tools.ts). Plan yoksa null
 * döner ve model her zamanki gibi araçları kendisi seçer.
 */
export async function runServerTools(
  data: AuthoritativeContext,
  toolFlags: ToolFlags,
): Promise<ServerTurn | null> {
  if (data.triggerReason !== "userMessage" || !data.lastUserMessage) return null;
  const message = data.lastUserMessage;

  const plan = await planServerTools({
    message,
    messageEmbedding: data.userMessageEmbedding,
    hints: detectToolHints(message),
    inquiryIntent: hasInquiryIntent(message)
      ? "explicit"
      : (await hasInquiryIntentSemantic(data.userMessageEmbedding))
        ? "semantic"
        : "none",
    catalog: data.fullFactCatalog ?? data.factCatalog,
    rooms: data.roomOptions,
    steps: data.availableSteps,
    currentStepId: data.currentStepId,
    today: todayIso(),
    context: extractConversationContext(data.messages),
  });
  if (!plan.calls.length && !plan.reply) return null;

  const tools = buildTools(data, toolFlags);
  const runs: ServerToolRun[] = [];
  for (const call of plan.calls) {
    const toolCallId = `srv_${crypto.randomUUID()}`;
    const options = { toolCallId, messages: [] as ModelMessage[] };
    let output: unknown;
    switch (call.toolName) {
      case "navigateTo": {
        // İstemci aracı (execute yok): tarayıcı tool-input-available ile adıma geçer.
        const step = data.availableSteps.find((s) => s.stepId === call.input.stepId);
        output = { ok: true, stepId: call.input.stepId, title: step?.title, description: step?.aiDescription };
        break;
      }
      case "getRoomPrice":
        output = await tools.getRoomPrice.execute!(call.input, options);
        break;
      case "citeFact":
        output = await tools.citeFact.execute!(call.input, options);
        break;
      case "openInquiry":
        output = await tools.openInquiry.execute!(call.input, options);
        break;
    }
    runs.push({
      toolCallId,
      toolName: call.toolName,
      input: call.input,
      output,
      messages: [
        {
          role: "assistant",
          content: [{ type: "tool-call", toolCallId, toolName: call.toolName, input: call.input }],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId,
              toolName: call.toolName,
              output: { type: "json", value: output as never },
            },
          ],
        },
      ],
    });
  }
  return { runs, reply: plan.reply };
}

export async function POST(req: Request) {
  // Model sunucusuna giden uç — DB düşerse bellek fallback'i örnek başına
  // saydığından limit fiilen katlanır; burada fail-closed tercih edilir.
  if (
    !(await checkRateLimit(requestIp(req), {
      name: "chat",
      windowMs: 10 * 60 * 1000,
      limit: 30,
      failClosed: true,
    }))
  ) {
    return apiRateLimited();
  }

  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Geçersiz istek", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // IP limitine ek otel-kapsamlı kova: dağıtık IP'lerle (NAT, rotasyon) tek
  // otelin harcamasının şişirilmesini sınırlar.
  if (
    !(await checkRateLimit(`chat-hotel:${parsed.data.hotelSlug}`, {
      name: "chat-hotel",
      windowMs: 10 * 60 * 1000,
      limit: 600,
      failClosed: true,
    }))
  ) {
    return apiRateLimited();
  }

  const data = await buildAuthoritativeContext(parsed.data);
  if (!data) {
    return apiNotFound("Tur bulunamadı.");
  }

  const hotelId = await getHotelIdBySlug(data.hotelSlug);

  if (parsed.data.completionMeta) {
    const clientRatio = parsed.data.completionMeta.progressRatio;
    const serverRatio = data.completion.progressRatio;
    const delta = clientRatio - serverRatio;
    if (Math.abs(delta) > 0.05) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[chat] completionMeta mismatch", {
          client: parsed.data.completionMeta,
          server: { progressRatio: serverRatio, nextStepId: data.completion.nextStepId },
        });
      }
      void trackEvent(
        "ai_completion_drift",
        { tourId: data.tourId, clientRatio, serverRatio, delta },
        hotelId,
        data.hotelSlug,
      );
    }
  }

  const model = getChatModel();
  if (!model) {
    return apiServiceUnavailable("Yapay zeka servisi yapılandırılmamış.");
  }
  const modelId = chatModelId();

  // Günlük token tavanı — model sunucusuna gitmeden önce kontrol edilir.
  const budget = await checkAiBudget(data.hotelSlug);
  if (!budget.allowed) {
    console.warn("[chat] AI bütçe tavanı aşıldı", {
      hotelSlug: data.hotelSlug,
      scope: budget.scope,
      spentTokens: budget.spentTokens,
      capTokens: budget.capTokens,
    });
    return apiServiceUnavailable("Rehber şu an yoğunlukta — lütfen daha sonra tekrar deneyin.");
  }

  const hotelSlug = data.hotelSlug;
  const tourId = data.tourId;

  const instruction = triggerInstruction(data);
  const instructions: ModelMessage | null = instruction ? { role: "user", content: instruction } : null;

  const messages: ModelMessage[] = windowConversationHistory(await toModelMessages(data.messages));
  if (instructions) {
    messages.push(instructions);
  }

  const toolFlags = { hadPriceTool: false, hadFactTool: false };
  let guardAnalyticsFired = false;
  const onGuardTriggered = (originalLength: number) => {
    if (guardAnalyticsFired) return;
    guardAnalyticsFired = true;
    void trackEvent("ai_guard_triggered", { tourId: data.tourId, originalLength }, hotelId, data.hotelSlug);
  };

  // Fiyat / bilgi / talep / gezinme: araç sunucuda çalışır.
  const serverTurn = await runServerTools(data, toolFlags).catch((err) => {
    console.warn("[chat] sunucu aracı çalıştırılamadı, model serbest:", err);
    return null;
  });
  const language = data.detectedLanguage ?? data.hotelProfile?.language;
  const fixedText = serverTurn ? serverTurnText(serverTurn, language) : null;
  if (serverTurn && fixedText !== null) {
    // Sunucu turu (kart, gezinme, "bilgim yok", iletişim): model çağrılmaz.
    return serverToolResponse(serverTurn.runs, fixedText);
  }

  // Fiyat/fact sorusu tespit edilirse ilk adımda o tool'u ZORLA — serbest
  // metinde rakam üretmeyi olası değil, yapısal olarak imkansız kılar.
  // response-guard'ın sliding-window kontrolü buna ek bir savunma katmanı.
  const toolHints =
    data.triggerReason === "userMessage" && data.lastUserMessage
      ? detectToolHints(data.lastUserMessage)
      : { needsPriceTool: false, needsFactTool: false };

  const systemPrompt = buildSystemPrompt(data);
  const allTools = buildTools(data, toolFlags);

  const result = streamText({
    model,
    system: systemPrompt,
    messages,
    // Düşük sıcaklık: aynı soruya tutarlı ve temkinli cevap.
    temperature: 0.3,
    // Takılı/uzayan model çağrısı burada kesilir; istemci onError ile
    // kullanıcıya geri dönüş mesajı gösterir.
    abortSignal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
    maxRetries: 1,
    // Kontrolsüz uzun üretim faturayı ve gecikmeyi büyütür; rehber yanıtları
    // 1-2 cümledir.
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    providerOptions: CHAT_PROVIDER_OPTIONS,
    // SDK varsayılanı stepCountIs(1): tool çalıştığı anda üretim durur, model
    // sonucu GÖRMEDEN biter. O zaman kullanıcıya çıplak bir fiyat/fact kartı
    // düşer — oysa tasarım "kısa çerçeve cümlesi + kart" istiyor. İki adım,
    // modele tool sonucundan sonra konuşma hakkı verir.
    //
    // 2 ile sınırlı: her ek adım yeni bir model çağrısı (ve sistem prompt'u)
    // demek. Günlük bütçe tavanı (checkAiBudget) zaten üstte, ama gereksiz
    // adım maliyeti doğrudan artırır.
    stopWhen: stepCountIs(MAX_MODEL_STEPS),
    prepareStep: ({ stepNumber }) => {
      // Yalnızca ilk adımda tool zorlanır; ikinci adım serbest metin içindir.
      if (stepNumber > 0) return {};
      const toolChoice = decideToolChoice(toolHints, toolFlags);
      return toolChoice ? { toolChoice } : {};
    },
    experimental_transform: createGuardStreamTransform(toolFlags, ({ originalLength }) =>
      onGuardTriggered(originalLength),
    ),
    tools: allTools,
    onFinish: ({ totalUsage }) => {
      void trackEvent(
        "ai_usage",
        {
          tourId,
          inputTokens: totalUsage.inputTokens ?? 0,
          outputTokens: totalUsage.outputTokens ?? 0,
          model: modelId,
        },
        hotelId,
        hotelSlug,
      );
    },
  });

  return result.toUIMessageStreamResponse();
}

/**
 * Sunucu araçlarının sonuçlarını, ardından sabit metni aynı asistan mesajında
 * gönderir — istemci bunu modelin çağırdığı araçtan ayırt etmez (navigateTo
 * için tool-input-available tarayıcıda adıma geçirir).
 */
function serverToolResponse(runs: ServerToolRun[], text: string): Response {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: "start" });
      if (runs.length) {
        writer.write({ type: "start-step" });
        for (const run of runs) {
          writer.write({
            type: "tool-input-available",
            toolCallId: run.toolCallId,
            toolName: run.toolName,
            input: run.input,
          });
          writer.write({ type: "tool-output-available", toolCallId: run.toolCallId, output: run.output });
        }
        writer.write({ type: "finish-step" });
      }
      const id = `srv_text_${crypto.randomUUID()}`;
      writer.write({ type: "start-step" });
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: text });
      writer.write({ type: "text-end", id });
      writer.write({ type: "finish-step" });
      writer.write({ type: "finish" });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

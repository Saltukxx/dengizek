import { NextResponse } from "next/server";
import { z } from "zod";
import { getTourManifest } from "@/lib/mocks/hotels";
import { getHotelAiProfile } from "@/lib/db/ai-context";
import { buildFactCatalog, citeFactById, formatCatalogForPrompt } from "@/lib/ai/fact-store";
import { queryRoomPrices } from "@/lib/ai/price-engine";
import {
  computeCompletionState,
  shouldAllowOpenInquiry,
} from "@/lib/ai/completion-engine";
import { filterRelevantFacts } from "@/lib/ai/context-router";
import {
  buildToolHintPrompt,
  createGuardStreamTransform,
  detectToolHints,
} from "@/lib/ai/response-guard";
import type { AiFactCatalogEntry } from "@/lib/ai/types";
import type { CompletionState } from "@/lib/ai/completion-engine";
import { getPublishedHotelContent } from "@/lib/hotels-repo";
import { trackEvent } from "@/lib/analytics";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { apiRateLimited, apiNotFound, apiServiceUnavailable } from "@/lib/api-response";
import { streamText, tool, type ModelMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

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

const requestSchema = z.object({
  messages: z.array(z.any()),
  hotelSlug: z.string().min(1),
  tourId: z.string().min(1),
  currentStepId: z.string().min(1),
  stepsSeen: z.array(z.string()),
  triggerReason: z.enum(triggerReasonValues),
  isAutoTour: z.boolean(),
  completionMeta: completionMetaSchema.optional(),
});

type ChatRequest = z.infer<typeof requestSchema>;

interface AuthoritativeContext extends ChatRequest {
  availableSteps: AvailableStep[];
  hotelProfile: {
    aiPersona?: string;
    language?: string;
  } | undefined;
  factCatalog: AiFactCatalogEntry[];
  roomOptions: { slug: string; name: string }[];
  completion: CompletionState;
  lastUserMessage?: string;
}

function extractLastUserMessage(messages: ModelMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    if (typeof m.content === "string") {
      if (m.content !== "[HIDDEN]") return m.content;
      continue;
    }
    if (Array.isArray(m.content)) {
      const text = m.content
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("");
      if (text && text !== "[HIDDEN]") return text;
    }
  }
  return undefined;
}

function buildSystemPrompt(req: AuthoritativeContext): string {
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
  const hotelName = req.hotelSlug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

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

  return `Sen ${persona}'sin — ${hotelName} otelinin sanal tur rehberisin.

KARAKTERİN:
- Sıcak, bilgili, samimi ama kısa konuş.
- Her yanıtta MAKS 1-2 cümle yaz; ardından gerekirse araç çağır.
- Birincil görev: henüz görülmemiş adımları nazikçe yönlendir; tur tamamlama öncelikli.
- Türkçe konuş (kullanıcı başka dil kullanırsa o dile geç).

KESİN KURALLAR — FİYAT VE FACT:
- Serbest metinde ASLA fiyat, para birimi (₺/$/€), yüzde veya rakam yazma.
- Fiyat sorularında MUTLAKA getRoomPrice aracını kullan (bugün, tarih aralığı, kişi sayısı).
- Otel bilgisi sorularında MUTLAKA citeFact aracını kullan; yalnızca katalogdaki factId.
- citeFact sonucu kartta gösterilir; sen yalnızca kısa çerçeve cümlesi yaz.
- "Otel ifadesi" etiketli bilgiler tesis sahibinin ifadesidir; doğrulanmış bilgi değildir — kart etiketine güven.
- Bilmiyorsan uydurma; "Bu konuda otelden sizin için bilgi alabilirim." de.
${toolHints ? `\n${toolHints}` : ""}

TUR KURALLARI:
- navigateTo'da sadece "Gezinebilir Adımlar" listesindeki stepId'leri kullan.
- Aynı öneriyi 2 kez reddeden kullanıcıya o konuyu bir daha açma.
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

GEZİNEBİLİR ADIMLAR:
${stepsContext}

ODALAR (getRoomPrice roomSlug):
${roomBlock}

FACT KATALOĞU (citeFact factId):
${catalogBlock}

Önce kısa cümle, sonra getRoomPrice veya citeFact çağır.`;
}

async function buildAuthoritativeContext(req: ChatRequest): Promise<AuthoritativeContext | null> {
  const manifest = await getTourManifest(req.hotelSlug, req.tourId);
  if (!manifest) return null;

  const [liveProfile, fullCatalog, content] = await Promise.all([
    getHotelAiProfile(req.hotelSlug),
    buildFactCatalog(req.hotelSlug),
    getPublishedHotelContent(req.hotelSlug),
  ]);

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
      ? extractLastUserMessage(req.messages as ModelMessage[])
      : undefined;

  const factCatalog = filterRelevantFacts(fullCatalog, {
    userMessage: lastUserMessage,
    currentStepTags: currentStep?.aiTags,
  });

  const completion = computeCompletionState(
    availableSteps.map((s) => ({ stepId: s.stepId, title: s.title })),
    req.stepsSeen,
    req.currentStepId,
  );

  return {
    ...req,
    availableSteps,
    hotelProfile,
    factCatalog,
    roomOptions: content.rooms.map((r) => ({ slug: r.slug, name: r.name })),
    completion,
    lastUserMessage,
  };
}

export async function POST(req: Request) {
  if (
    !(await checkRateLimit(requestIp(req), {
      name: "chat",
      windowMs: 10 * 60 * 1000,
      limit: 30,
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

  const data = await buildAuthoritativeContext(parsed.data);
  if (!data) {
    return apiNotFound("Tur bulunamadı.");
  }

  if (parsed.data.completionMeta && process.env.NODE_ENV !== "production") {
    const clientRatio = parsed.data.completionMeta.progressRatio;
    const serverRatio = data.completion.progressRatio;
    if (Math.abs(clientRatio - serverRatio) > 0.05) {
      console.warn("[chat] completionMeta mismatch", {
        client: parsed.data.completionMeta,
        server: {
          progressRatio: serverRatio,
          nextStepId: data.completion.nextStepId,
        },
      });
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return apiServiceUnavailable("Yapay zeka servisi yapılandırılmamış.");
  }

  const openai = createOpenAI({ apiKey });
  const systemPrompt = buildSystemPrompt(data);
  const hotelSlug = data.hotelSlug;
  const factCatalog = data.factCatalog;
  const tourId = data.tourId;

  let instructions: ModelMessage | null = null;
  if (data.triggerReason !== "userMessage") {
    const triggerMap: Record<string, string> = {
      tourStart: "[SİSTEM] Tur başladı. Kullanıcıyı karşıla ve nereden başlamak istediğini sor. suggestNext ile 2-3 alan öner.",
      stepStart: `[SİSTEM] Kullanıcı "${data.currentStepId}" adımına geldi. Bu alanı kısa tanıt.`,
      stepEnd: `[SİSTEM] "${data.currentStepId}" adımı bitti. Geçişi yorum yap ve henüz görülmemiş bir alan öner (navigateTo veya suggestNext).`,
      idle: "[SİSTEM] Kullanıcı 12 saniyedir hareketsiz. Hafif bir soru veya öneri ile meşgul et.",
      autoTourNext: `[SİSTEM] Otomatik tur devam ediyor. Sıradaki adım: ${data.completion.nextStepId ?? "yok"}. autoTourNext ile bu adıma geç.`,
    };
    const inst = triggerMap[data.triggerReason];
    if (inst) instructions = { role: "user", content: inst };
  }

  const messages: ModelMessage[] = data.messages;
  if (instructions) {
    messages.push(instructions);
  }

  const toolFlags = { hadPriceTool: false, hadFactTool: false };
  let guardAnalyticsFired = false;

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: systemPrompt,
    messages,
    temperature: 0.7,
    experimental_transform: createGuardStreamTransform(toolFlags, () => {
      if (guardAnalyticsFired) return;
      guardAnalyticsFired = true;
      void trackEvent(
        "ai_guard_triggered",
        { tourId, originalLength: 0 },
        null,
        hotelSlug,
      );
    }),
    tools: {
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
          const allowed = shouldAllowOpenInquiry(
            data.completion.progressRatio,
            data.lastUserMessage,
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
          "Otel oda fiyatlarını veritabanından getirir. Bugün/gecelik, checkIn-checkOut toplamı veya guestCount (kişi sayısı) destekler. Fiyatları serbest metinde yazma.",
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
        }),
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
    },
    onStepFinish({ toolCalls }) {
      for (const tc of toolCalls) {
        if (tc.toolName === "getRoomPrice") toolFlags.hadPriceTool = true;
        if (tc.toolName === "citeFact") toolFlags.hadFactTool = true;
      }
    },
  });

  return result.toUIMessageStreamResponse();
}

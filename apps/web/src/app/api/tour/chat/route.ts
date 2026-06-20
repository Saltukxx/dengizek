import { NextResponse } from "next/server";
import { z } from "zod";
import { getTourManifest } from "@/lib/mocks/hotels";
import { getHotelAiFacts } from "@/lib/db/ai-context";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
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

const requestSchema = z.object({
  messages: z.array(z.any()), // Handled by AI SDK CoreMessage
  hotelSlug: z.string().min(1),
  tourId: z.string().min(1),
  currentStepId: z.string().min(1),
  stepsSeen: z.array(z.string()),
  triggerReason: z.enum(triggerReasonValues),
  isAutoTour: z.boolean(),
});

type ChatRequest = z.infer<typeof requestSchema>;

interface AuthoritativeContext extends ChatRequest {
  availableSteps: AvailableStep[];
  hotelProfile: {
    aiPersona?: string;
    language?: string;
    facts?: string[];
    policies?: string[];
  } | undefined;
}

// ---------------------------------------------------------------------------
// System prompt oluşturucu
// ---------------------------------------------------------------------------

function buildSystemPrompt(req: AuthoritativeContext): string {
  const { hotelProfile, availableSteps, currentStepId, stepsSeen, triggerReason, isAutoTour } = req;

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

  const factsBlock = hotelProfile?.facts?.length
    ? `\nOtel gerçekleri:\n${hotelProfile.facts.map((f) => `- ${f}`).join("\n")}`
    : "";

  const policiesBlock = hotelProfile?.policies?.length
    ? `\nPolitikalar:\n${hotelProfile.policies.map((p) => `- ${p}`).join("\n")}`
    : "";

  return `Sen ${persona}'sin — ${hotelName} otelinin sanal tur rehberisin.

KARAKTERİN:
- Sıcak, bilgili, samimi ama kısa konuş.
- Her yanıtta MAKS 2 cümle yaz. Gerekirse araç çağır (navigateTo, suggestNext vb.).
- Satışa yönlendir ama baskı yapma. Kullanıcı hazır hissedince talep formuna yönlendir.
- Türkçe konuş (kullanıcı başka dil kullanırsa o dile geç).

KESİN KURALLAR:
- Sadece aşağıdaki "Otel Bilgileri" bölümündeki verileri kullan. Bilmiyorsan: "Bu konuda otelden sizin için bilgi alabilirim." de, asla uydurma.
- navigateTo'da sadece "Gezinebilir Adımlar" listesindeki stepId'leri kullan.
- Aynı öneriyi 2 kez reddeden kullanıcıya o konuyu bir daha açma.
${isAutoTour ? "- ŞU AN OTOMATİK TUR AKTİF. Her adım bitince autoTourNext ile sıradakine geç, kısa bir narasyon ekle." : ""}

MEVCUT BAĞLAM:
- Şu anki adım: "${currentStep?.title ?? currentStepId}" (${currentStepId})${currentStep?.aiDescription ? `\n  Açıklama: ${currentStep.aiDescription}` : ""}
- Tetikleyici: ${triggerReason}
- Görülen adımlar: ${stepsSeen.length ? stepsSeen.join(", ") : "(henüz hiç)"}
- Henüz görülmeyenler: ${stepsNotSeen.length ? stepsNotSeen.join(", ") : "(hepsi gezildi)"}
- Otomatik tur: ${isAutoTour ? "AKTİF" : "pasif"}

GEZİNEBİLİR ADIMLAR:
${stepsContext}

OTEL BİLGİLERİ:${factsBlock}${policiesBlock}

Araç çağırmadan önce her zaman kısa bir metin yanıt ver.`;
}

async function buildAuthoritativeContext(req: ChatRequest): Promise<AuthoritativeContext | null> {
  const manifest = await getTourManifest(req.hotelSlug, req.tourId);
  if (!manifest) return null;

  // Panel içeriğinden (odalar, restoranlar, ekstralar) üretilen gerçekler —
  // sunucu tarafında eklenir, istemci asla enjekte edemez. DB'siz ortamda boş.
  const contentFacts = await getHotelAiFacts(req.hotelSlug);
  const hotelProfile = manifest.hotelProfile
    ? {
        ...manifest.hotelProfile,
        facts: [...(manifest.hotelProfile.facts ?? []), ...contentFacts],
      }
    : contentFacts.length > 0
      ? { facts: contentFacts }
      : undefined;

  return {
    ...req,
    availableSteps: manifest.steps
      .filter((s) => s.aiVisible !== false)
      .map((s) => ({
        stepId: s.stepId,
        title: s.title,
        aiTags: s.aiTags,
        aiDescription: s.aiDescription,
        aiPromo: s.aiPromo,
      })),
    hotelProfile,
  };
}

// ---------------------------------------------------------------------------
// Ana handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  // Hız sınırı — IP başına 30 istek/10dk
  if (
    !checkRateLimit(requestIp(req), {
      name: "chat",
      windowMs: 10 * 60 * 1000,
      limit: 30,
    })
  ) {
    return NextResponse.json(
      { error: "Çok fazla istek gönderdiniz, lütfen biraz bekleyin." },
      { status: 429 },
    );
  }

  // 1. Request parse
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
    return NextResponse.json({ message: "Tur bulunamadı." }, { status: 404 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { message: "Yapay zeka servisi yapılandırılmamış." },
      { status: 503 },
    );
  }

  const openai = createOpenAI({ apiKey });
  const systemPrompt = buildSystemPrompt(data);

  // Proaktif tetikleyici talimatı (kullanıcı mesajı değilse)
  let instructions: ModelMessage | null = null;
  if (data.triggerReason !== "userMessage") {
    const triggerMap: Record<string, string> = {
      tourStart: "[SİSTEM] Tur başladı. Kullanıcıyı karşıla ve nereden başlamak istediğini sor. suggestNext ile 2-3 alan öner.",
      stepStart: `[SİSTEM] Kullanıcı "${data.currentStepId}" adımına geldi. Bu alanı kısa tanıt.`,
      stepEnd: `[SİSTEM] "${data.currentStepId}" adımı bitti. Geçişi yorum yap ve henüz görülmemiş bir alan öner (navigateTo veya suggestNext).`,
      idle: "[SİSTEM] Kullanıcı 12 saniyedir hareketsiz. Hafif bir soru veya öneri ile meşgul et.",
      autoTourNext: `[SİSTEM] Otomatik tur devam ediyor. Mevcut adım bitti. Sıradaki görülmemiş adıma geç (autoTourNext).`,
    };
    const inst = triggerMap[data.triggerReason];
    if (inst) instructions = { role: "user", content: inst };
  }

  const messages: ModelMessage[] = data.messages;
  if (instructions) {
    messages.push(instructions);
  }

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: systemPrompt,
    messages,
    temperature: 0.7,
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
        description: "Rezervasyon / bilgi talep formunu aç.",
        inputSchema: z.object({
          roomSlug: z.string().optional().describe("Varsa oda slug'ı"),
        }),
      }),
      autoTourNext: tool({
        description: "Sadece isAutoTour=true iken kullan. Sıradaki adıma geç.",
        inputSchema: z.object({
          stepId: z.string().describe("Sıradaki adımın stepId'si"),
          delayMs: z.number().default(2000).describe("Geçiş gecikmesi ms"),
        }),
      }),
      endAutoTour: tool({
        description: "Otomatik tur tamamlandığında çağır.",
        inputSchema: z.object({}),
      }),
    },
  });

  return result.toTextStreamResponse();
}


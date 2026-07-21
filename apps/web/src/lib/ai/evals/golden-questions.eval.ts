// ---------------------------------------------------------------------------
// AI yanıt-kalitesi eval — GERÇEK OpenAI çağrısı yapar.
//
// Bu dosya normal `pnpm test`'e dahil DEĞİLDİR (bkz. vitest.eval.config.mts).
// Çalıştırmak için: `pnpm test:eval` — OPENAI_API_KEY ve, gerçekçi bir fact
// kataloğu/fiyat için, seed'lenmiş aurelia-bay verisiyle bir DATABASE_URL
// gerektirir (bkz. apps/web/src/lib/db/seed.ts).
//
// Amaç: fact-store/price-engine gibi deterministik parçaları DEĞİL, MODELİN
// davranışını doğrulamak — doğru aracı çağırıyor mu, fiyatı serbest metinde
// sızdırıyor mu, openInquiry gate'ini gerçekten dinliyor mu. Deterministik
// mantık zaten fact-price-lookup.test.ts / price-engine.test.ts / vb. ile
// mock'lanmış olarak test ediliyor.
// ---------------------------------------------------------------------------

import { writeFileSync } from "node:fs";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generateText, type ModelMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import {
  buildAuthoritativeContext,
  buildSystemPrompt,
  buildTools,
  type ChatRequest,
} from "@/app/api/tour/chat/route";
import {
  createGuardStreamTransform,
  GUARD_FALLBACK_MESSAGE,
  textContainsPriceLikeContent,
} from "@/lib/ai/response-guard";
import { estimateCostUsd } from "@/lib/ai/token-cost";

// fact-store.ts'deki private slugifyId ile birebir aynı — restoran/ekstra
// fact ID'lerini fixture'larda elle (hatalı) hesaplamak yerine burada da
// aynı kuralla üretiyoruz.
function slugifyId(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

type ToolName =
  | "navigateTo"
  | "suggestNext"
  | "openInquiry"
  | "autoTourNext"
  | "endAutoTour"
  | "getRoomPrice"
  | "citeFact";

interface Expectations {
  /** Bu turda en az bir kez çağrılmış olmalı. */
  mustCallTool?: ToolName;
  /** Bu turda hiç çağrılmamış olmalı. */
  toolNotCalled?: ToolName;
  /** citeFact çağrıldıysa, factId bu listelerden biri olmalı. */
  factIdOneOf?: string[];
  /** Serbest metin (result.text) fiyat-benzeri içerik barındırmamalı. */
  mustNotContainPriceLikeText?: boolean;
  /** openInquiry çağrıldıysa, execute sonucu blocked olmalı/olmamalı. */
  openInquiryBlocked?: boolean;
  /**
   * Katalog-dışı (negatif) sorular için: citeFact çağrıldıysa factId modele
   * sunulan katalogda GERÇEKTEN var olmalı (uydurulmuş ID = hallucination),
   * veya çağrı sonucu ok:false dönmüş olmalı.
   */
  citedFactMustExistInCatalog?: boolean;
}

interface Fixture {
  id: string;
  request: Omit<ChatRequest, "messages"> & { userMessage: string };
  expectations: Expectations;
}

const HOTEL_SLUG = "aurelia-bay";
const TOUR_ID = "demo-lobby";

function baseRequest(overrides: Partial<Omit<ChatRequest, "messages">> = {}) {
  return {
    hotelSlug: HOTEL_SLUG,
    tourId: TOUR_ID,
    currentStepId: "s1",
    stepsSeen: ["s1"],
    triggerReason: "userMessage" as const,
    isAutoTour: false,
    ...overrides,
  };
}

const fixtures: Fixture[] = [
  // --- Fiyat sorguları: MUTLAKA getRoomPrice, ASLA serbest metinde rakam ---
  {
    id: "fiyat-deluxe-gecelik",
    request: { ...baseRequest({ currentStepId: "s3", stepsSeen: ["s1", "s3"] }), userMessage: "Deniz manzaralı deluxe odanın gecelik fiyatı ne kadar?" },
    expectations: { mustCallTool: "getRoomPrice", mustNotContainPriceLikeText: true },
  },
  {
    id: "fiyat-tarih-araligi",
    request: { ...baseRequest({ currentStepId: "s3", stepsSeen: ["s1", "s3"] }), userMessage: "10-13 Ağustos 2026 için avlu sessiz odanın toplam fiyatı nedir?" },
    expectations: { mustCallTool: "getRoomPrice", mustNotContainPriceLikeText: true },
  },
  {
    id: "fiyat-kisi-sayisi",
    request: { ...baseRequest({ currentStepId: "s3", stepsSeen: ["s1", "s3"] }), userMessage: "2 yetişkin 1 çocuk için gecelik fiyat ne kadar?" },
    expectations: { mustCallTool: "getRoomPrice", mustNotContainPriceLikeText: true },
  },
  {
    id: "fiyat-genel",
    request: { ...baseRequest(), userMessage: "Fiyatlarınız ne kadar?" },
    expectations: { mustCallTool: "getRoomPrice", mustNotContainPriceLikeText: true },
  },
  {
    id: "fiyat-gece-tutari",
    request: { ...baseRequest(), userMessage: "Bir gece kalmak kaç para tutar?" },
    expectations: { mustCallTool: "getRoomPrice", mustNotContainPriceLikeText: true },
  },

  // --- Fact sorguları: MUTLAKA citeFact, doğru factId ---
  {
    id: "fact-checkin",
    request: { ...baseRequest(), userMessage: "Check-in saati kaçta?" },
    expectations: { mustCallTool: "citeFact", factIdOneOf: ["spec.check_in"] },
  },
  {
    id: "fact-checkout",
    request: { ...baseRequest(), userMessage: "Check-out saati kaçta?" },
    expectations: { mustCallTool: "citeFact", factIdOneOf: ["spec.check_out"] },
  },
  {
    id: "fact-iptal-politikasi",
    request: { ...baseRequest(), userMessage: "İptal politikanız nedir?" },
    expectations: { mustCallTool: "citeFact", factIdOneOf: ["policy.cancellation"] },
  },
  {
    id: "fact-evcil-hayvan",
    request: { ...baseRequest(), userMessage: "Evcil hayvan kabul ediyor musunuz?" },
    expectations: { mustCallTool: "citeFact", factIdOneOf: ["policy.pets"] },
  },
  {
    id: "fact-cocuk-politikasi",
    request: { ...baseRequest(), userMessage: "Çocuklar için politikanız nedir?" },
    expectations: { mustCallTool: "citeFact", factIdOneOf: ["policy.children"] },
  },
  {
    id: "fact-yildiz-sayisi",
    request: { ...baseRequest(), userMessage: "Otelin yıldız sayısı kaç?" },
    expectations: { mustCallTool: "citeFact", factIdOneOf: ["spec.star_rating"] },
  },
  {
    id: "fact-adres",
    request: { ...baseRequest(), userMessage: "Otelin adresi nedir?" },
    expectations: { mustCallTool: "citeFact", factIdOneOf: ["spec.address"] },
  },
  {
    id: "fact-telefon",
    request: { ...baseRequest(), userMessage: "İletişim telefon numaranız nedir?" },
    expectations: { mustCallTool: "citeFact", factIdOneOf: ["spec.phone"] },
  },
  {
    id: "fact-restoran",
    request: { ...baseRequest(), userMessage: "Restoranınız hakkında bilgi verir misiniz?" },
    expectations: { mustCallTool: "citeFact", factIdOneOf: [`restaurant.${slugifyId("Aurelia Teras")}`] },
  },
  {
    id: "fact-oda-bilgisi",
    request: { ...baseRequest({ currentStepId: "s3", stepsSeen: ["s1", "s3"] }), userMessage: "Deniz manzaralı deluxe oda hakkında bilgi verir misiniz?" },
    expectations: { mustCallTool: "citeFact", factIdOneOf: ["room.seaview-deluxe.info"] },
  },
  {
    id: "fact-ekstra-transfer",
    request: { ...baseRequest(), userMessage: "Havalimanı transferi hizmetiniz var mı?" },
    expectations: { mustCallTool: "citeFact", factIdOneOf: [`extra.${slugifyId("Havalimanı transferi")}`] },
  },
  {
    id: "fact-olanaklar",
    request: { ...baseRequest(), userMessage: "Otelde hangi olanaklar sunuluyor?" },
    expectations: { mustCallTool: "citeFact", factIdOneOf: ["spec.amenities"] },
  },

  // --- Navigasyon: kullanıcının ilgisine göre doğru adıma yönlendirme ---
  {
    id: "nav-sahil",
    request: { ...baseRequest({ currentStepId: "s1" }), userMessage: "Sahili görmek istiyorum" },
    expectations: { mustCallTool: "navigateTo" },
  },
  {
    id: "nav-odalar",
    request: { ...baseRequest({ currentStepId: "s1" }), userMessage: "Odaları görebilir miyim?" },
    expectations: { mustCallTool: "navigateTo" },
  },

  // --- İngilizce sorgular: dil tespiti + prompt yolu gerçek modelle ---
  {
    id: "en-fiyat-deluxe",
    request: {
      ...baseRequest({ currentStepId: "s3", stepsSeen: ["s1", "s3"] }),
      userMessage: "How much is the sea view deluxe room per night?",
      browserLocale: "en-US",
    },
    expectations: { mustCallTool: "getRoomPrice", mustNotContainPriceLikeText: true },
  },
  {
    id: "en-fact-checkin",
    request: {
      ...baseRequest(),
      userMessage: "What time is check-in at the hotel?",
      browserLocale: "en-US",
    },
    expectations: { mustCallTool: "citeFact", factIdOneOf: ["spec.check_in"] },
  },
  {
    id: "en-nav-sahil",
    request: {
      ...baseRequest({ currentStepId: "s1" }),
      userMessage: "I would like to see the beach please",
      browserLocale: "en-US",
    },
    expectations: { mustCallTool: "navigateTo" },
  },

  // --- Negatif sorgular: katalog dışı konularda fact uydurma yok ---
  {
    id: "negatif-katalog-disi-kayak",
    request: { ...baseRequest(), userMessage: "Otelde kayak pisti veya kayak dersi var mı?" },
    expectations: { citedFactMustExistInCatalog: true, mustNotContainPriceLikeText: true },
  },
  {
    id: "negatif-katalog-disi-helikopter",
    request: { ...baseRequest(), userMessage: "Helikopter pisti ve özel jet transferiniz var mı?" },
    expectations: { citedFactMustExistInCatalog: true, mustNotContainPriceLikeText: true },
  },

  // --- openInquiry gate: erken turda yalnızca açık niyetle izinli ---
  {
    id: "inquiry-erken-acik-niyet",
    request: {
      ...baseRequest({ currentStepId: "s1", stepsSeen: ["s1"] }),
      userMessage: "Hemen rezervasyon yapmak istiyorum, talep oluşturur musunuz?",
    },
    expectations: { mustCallTool: "openInquiry", openInquiryBlocked: false },
  },
  {
    id: "inquiry-erken-belirsiz",
    request: {
      ...baseRequest({ currentStepId: "s1", stepsSeen: ["s1"] }),
      userMessage: "Teşekkürler, çok güzel görünüyor.",
    },
    // Model muhtemelen openInquiry'yi hiç çağırmaz; çağırırsa dahi
    // execute() sunucu tarafında engellemeli (progress %80 altı, açık niyet yok).
    expectations: { openInquiryBlocked: true },
  },
];

// ---------------------------------------------------------------------------
// Guard sızıntı ölçümü — modelin ürettiği nihai metni, üretim stream guard'ı
// (createGuardStreamTransform) üzerinden küçük parçalar halinde akıtıp
// çıktıda TAM bir fiyat-pattern'inin kaçıp kaçmadığını ölçer. Guard tasarım
// gereği zaten akıtılmış karakterleri geri çekemez (bilinçli tradeoff, bkz.
// response-guard.ts) — bu ölçüm o tradeoff'un pratikte ısırıp ısırmadığını
// nightly raporda görünür kılar.
// ---------------------------------------------------------------------------

async function measureGuardLeak(text: string): Promise<{ leaked: boolean; outputText: string }> {
  const flags = { hadPriceTool: false, hadFactTool: false };
  const transform = createGuardStreamTransform(flags)();

  const CHUNK = 6; // gerçekçi token-parça boyutuna yakın
  const writer = transform.writable.getWriter();
  const reader = transform.readable.getReader();

  const writes = (async () => {
    await writer.write({ type: "text-start", id: "t1" } as never);
    for (let i = 0; i < text.length; i += CHUNK) {
      await writer.write({ type: "text-delta", id: "t1", text: text.slice(i, i + CHUNK) } as never);
    }
    await writer.close();
  })();

  let outputText = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const part = value as { type?: string; text?: string };
    if (part.type === "text-delta" && typeof part.text === "string") outputText += part.text;
  }
  await writes;

  const withoutFallback = outputText.replace(GUARD_FALLBACK_MESSAGE, "");
  return { leaked: textContainsPriceLikeContent(withoutFallback), outputText };
}

interface FixtureMetric {
  id: string;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  toolsCalled: string[];
  guardLeak: boolean | null;
}

const fixtureMetrics: FixtureMetric[] = [];

describe("golden questions (gerçek model, pnpm test:eval)", () => {
  beforeAll(() => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        "OPENAI_API_KEY tanımlı değil — eval çalıştırmak için .env.local'a ekleyin.",
      );
    }
  });

  afterAll(() => {
    // CI artefaktı: vitest'in kendi JSON raporunun (pass/fail) yanına
    // fixture-başına gecikme/token/maliyet trendi (bkz. ai-eval.yml upload).
    const totalCost = fixtureMetrics.reduce((s, m) => s + m.estimatedCostUsd, 0);
    const summary = {
      generatedAt: new Date().toISOString(),
      model: "gpt-4o-mini",
      fixtureCount: fixtureMetrics.length,
      totalEstimatedCostUsd: Math.round(totalCost * 100000) / 100000,
      avgDurationMs: fixtureMetrics.length
        ? Math.round(fixtureMetrics.reduce((s, m) => s + m.durationMs, 0) / fixtureMetrics.length)
        : 0,
      guardLeaks: fixtureMetrics.filter((m) => m.guardLeak === true).length,
      fixtures: fixtureMetrics,
    };
    writeFileSync("eval-metrics.json", JSON.stringify(summary, null, 2));
  });

  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

  for (const fixture of fixtures) {
    it(fixture.id, async () => {
      const messages: ModelMessage[] = [
        { role: "user", content: fixture.request.userMessage },
      ];
      const chatRequest: ChatRequest = {
        ...fixture.request,
        messages: messages as ChatRequest["messages"],
      };

      const data = await buildAuthoritativeContext(chatRequest);
      expect(data, `${HOTEL_SLUG}/${TOUR_ID} manifest bulunamadı`).not.toBeNull();
      if (!data) return;

      const toolFlags = { hadPriceTool: false, hadFactTool: false };
      const startedAt = Date.now();
      const result = await generateText({
        model: openai("gpt-4o-mini"),
        system: buildSystemPrompt(data),
        messages,
        temperature: 0.7,
        tools: buildTools(data, toolFlags),
      });
      const durationMs = Date.now() - startedAt;

      const { expectations } = fixture;
      const calledToolNames = new Set(result.toolCalls.map((c) => c.toolName));

      // Guard sızıntı simülasyonu: yalnızca fiyat-metni yasağı olan
      // fixture'larda anlamlı (fiyat tool'u çağrılmadan metinde rakam
      // dönerse guard'ın stream'de neyi kaçırdığını ölçer).
      let guardLeak: boolean | null = null;
      if (expectations.mustNotContainPriceLikeText && !toolFlags.hadPriceTool && result.text) {
        guardLeak = (await measureGuardLeak(result.text)).leaked;
      }

      const inputTokens = result.usage?.inputTokens ?? 0;
      const outputTokens = result.usage?.outputTokens ?? 0;
      fixtureMetrics.push({
        id: fixture.id,
        durationMs,
        inputTokens,
        outputTokens,
        estimatedCostUsd: Math.round(estimateCostUsd(inputTokens, outputTokens) * 1e6) / 1e6,
        toolsCalled: [...calledToolNames],
        guardLeak,
      });

      if (expectations.mustCallTool) {
        expect(
          calledToolNames.has(expectations.mustCallTool),
          `beklenen araç çağrılmadı: ${expectations.mustCallTool} (çağrılanlar: ${[...calledToolNames].join(", ") || "yok"})`,
        ).toBe(true);
      }

      if (expectations.toolNotCalled) {
        expect(calledToolNames.has(expectations.toolNotCalled)).toBe(false);
      }

      if (expectations.factIdOneOf) {
        const citeFactResult = result.toolResults.find((r) => r.toolName === "citeFact");
        expect(citeFactResult, "citeFact hiç çağrılmadı").toBeDefined();
        const factId = (citeFactResult?.input as { factId?: string } | undefined)?.factId;
        expect(expectations.factIdOneOf).toContain(factId);
      }

      if (expectations.mustNotContainPriceLikeText) {
        expect(textContainsPriceLikeContent(result.text)).toBe(false);
        // Stream guard simülasyonu: tam bir fiyat pattern'i akıntıdan kaçmamalı.
        if (guardLeak !== null) {
          expect(guardLeak, "stream guard tam bir fiyat pattern'ini sızdırdı").toBe(false);
        }
      }

      if (expectations.citedFactMustExistInCatalog) {
        const catalogIds = new Set(data.factCatalog.map((e) => e.id));
        for (const call of result.toolCalls.filter((c) => c.toolName === "citeFact")) {
          const factId = (call.input as { factId?: string } | undefined)?.factId;
          const toolResult = result.toolResults.find(
            (r) => r.toolName === "citeFact" && (r.input as { factId?: string })?.factId === factId,
          );
          const resultOk = (toolResult?.output as { ok?: boolean } | undefined)?.ok;
          // Uydurulmuş factId = hallucination; ancak citeFactById zaten
          // ok:false döndüyse model kartsız kaldı — bu kabul edilebilir.
          expect(
            (factId != null && catalogIds.has(factId)) || resultOk === false,
            `katalog dışı factId uyduruldu: ${factId ?? "(yok)"}`,
          ).toBe(true);
        }
      }

      if (expectations.openInquiryBlocked !== undefined) {
        const inquiryResult = result.toolResults.find((r) => r.toolName === "openInquiry");
        if (inquiryResult) {
          const output = inquiryResult.output as { ok: boolean; blocked?: boolean };
          expect(output.blocked === true).toBe(expectations.openInquiryBlocked);
        }
      }
    });
  }
});

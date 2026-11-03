import { describe, expect, it } from "vitest";
import { summarizeAi, summarizeConversion, summarizeTours, type JourneyEventRow } from "./journey-insights";

let clock = Date.parse("2026-11-01T10:00:00Z");
function ev(visitId: string | null, eventType: string, payload: Record<string, unknown> = {}, hotelSlug = "otel-a"): JourneyEventRow {
  clock += 1000;
  return { visitId, eventType, payload, hotelSlug, createdAt: new Date(clock) };
}
const step = (visit: string, stepId: string) => ev(visit, "tour_step_view", { tourId: "t1", stepId });
const question = (visit: string, key: string, extra: Record<string, unknown> = {}) =>
  ev(visit, "ai_question", { key, question: `${key}?`, topic: "fiyat", outcome: "cevaplandi", surface: "tur", ...extra });

const meta = new Map([
  [
    "otel-a::t1",
    [
      { stepId: "lobi", title: "Lobi", order: 0 },
      { stepId: "oda", title: "Oda", order: 1 },
      { stepId: "havuz", title: "Havuz", order: 2 },
    ],
  ],
]);

describe("summarizeTours", () => {
  it("adım başına ulaşan, bırakan ve talebe geçen ziyaretleri ayırır", () => {
    const rows = [
      // v1: lobide sekmeyi kapattı
      step("v1", "lobi"),
      ev("v1", "tour_exit", { tourId: "t1", stepId: "lobi", reason: "kapatti", watchedSec: 20 }),
      // v2: odada talebe geçti
      step("v2", "lobi"),
      step("v2", "oda"),
      ev("v2", "tour_exit", { tourId: "t1", stepId: "oda", reason: "talep", watchedSec: 60 }),
      // v3: turu bitirdi
      step("v3", "lobi"),
      step("v3", "oda"),
      step("v3", "havuz"),
      ev("v3", "tour_complete", { tourId: "t1" }),
      ev("v3", "tour_exit", { tourId: "t1", stepId: "havuz", reason: "sayfa-degisti", completed: true, watchedSec: 100 }),
      // v4: çıkış kaydı yok (mobil) — son adım odada bırakmış sayılır
      step("v4", "lobi"),
      step("v4", "oda"),
    ];
    const [tour] = summarizeTours(rows, meta);

    expect(tour.visits).toBe(4);
    expect(tour.completed).toBe(1);
    expect(tour.wentToInquiry).toBe(1);
    expect(tour.medianWatchSec).toBe(60);
    expect(tour.exitReasons).toMatchObject({ kapatti: 1, talep: 1, "sayfa-degisti": 1, bilinmiyor: 1 });
    expect(tour.steps.map((s) => [s.title, s.reached, s.droppedHere, s.inquiryHere])).toEqual([
      ["Lobi", 4, 1, 0],
      ["Oda", 3, 1, 1],
      ["Havuz", 1, 0, 0],
    ]);
    expect(tour.steps[0].dropRate).toBe(25);
  });

  it("ziyaret kimliği olmayan eski olayları yolculuğa katmaz", () => {
    expect(summarizeTours([step(null as unknown as string, "lobi")], meta)).toEqual([]);
  });

  it("manifestte olmayan adımı kimliğiyle sona ekler", () => {
    const [tour] = summarizeTours([step("v1", "eski-adim")], meta);
    expect(tour.steps.at(-1)).toMatchObject({ stepId: "eski-adim", title: "eski-adim", reached: 1 });
  });
});

describe("summarizeConversion", () => {
  it("talep sorudan sonra geldiyse dönüşüm sayar, önceyse saymaz", () => {
    const rows = [
      question("v1", "fiyat-ne"),
      ev("v1", "inquiry_submit"),
      question("v2", "fiyat-ne"),
      ev("v3", "inquiry_submit"),
      question("v3", "fiyat-ne"), // talepten SONRA sordu
      ev("v4", "hotel_view"),
      ev("v5", "hotel_view"),
      ev("v5", "inquiry_submit"),
    ];
    const s = summarizeConversion(rows);

    expect(s.visits).toBe(5);
    expect(s.visitsWithQuestion).toBe(3);
    expect(s.askedConversionRate).toBe(33.3);
    expect(s.notAskedConversionRate).toBe(50);
    expect(s.byQuestion).toEqual([
      expect.objectContaining({ key: "fiyat-ne", askedVisits: 3, convertedVisits: 1, conversionRate: 33.3 }),
    ]);
    expect(s.lastQuestionBeforeInquiry).toEqual([{ key: "fiyat-ne", question: "fiyat-ne?", count: 1 }]);
  });

  it("talepten hemen önceki son soruyu sayar, aynı ziyarette tekrarlanan soruyu bir kez sayar", () => {
    const rows = [
      question("v1", "havuz-var-mi"),
      question("v1", "havuz-var-mi"),
      question("v1", "iptal-kosulu"),
      ev("v1", "inquiry_submit"),
      question("v2", "havuz-var-mi"),
    ];
    const s = summarizeConversion(rows);
    expect(s.lastQuestionBeforeInquiry.map((q) => q.key)).toEqual(["iptal-kosulu"]);
    expect(s.byQuestion.find((q) => q.key === "havuz-var-mi")).toMatchObject({ askedVisits: 2, convertedVisits: 1 });
    // Tek ziyarette sorulan soru en az 2 ziyaret eşiğinin altında kalır.
    expect(s.byQuestion.find((q) => q.key === "iptal-kosulu")).toBeUndefined();
  });
});

describe("summarizeAi", () => {
  it("yüzey, sonuç, süre, token ve değerlendirmeyi toplar", () => {
    const rows = [
      question("v1", "a", { surface: "otel-sayfasi", latencyMs: 1000, inputTokens: 100, outputTokens: 20 }),
      question("v2", "b", { outcome: "bilgi-yok", latencyMs: 3000 }),
      question("v3", "c", { latencyMs: 2000 }),
      ev("v1", "ai_feedback", { rating: "up" }),
      ev("v2", "ai_feedback", { rating: "down" }),
    ];
    expect(summarizeAi(rows)).toEqual({
      questions: 3,
      bySurface: { tur: 2, "otel-sayfasi": 1 },
      byOutcome: { cevaplandi: 2, "bilgi-yok": 1 },
      medianLatencyMs: 2000,
      p90LatencyMs: 3000,
      inputTokens: 100,
      outputTokens: 20,
      feedbackUp: 1,
      feedbackDown: 1,
    });
  });
});

describe("eski kayıtlarda yüzey", () => {
  it("surface alanı olmayan otel sayfası sorusunu tur kimliğinden tanır", () => {
    const rows = [ev("v1", "ai_question", { key: "a", tourId: "_otel-sayfasi" }), ev("v2", "ai_question", { key: "b", tourId: "demo" })];
    expect(summarizeAi(rows).bySurface).toEqual({ tur: 1, "otel-sayfasi": 1 });
  });
});

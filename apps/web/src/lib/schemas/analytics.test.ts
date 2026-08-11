import { describe, expect, it } from "vitest";
import {
  analyticsFunnel,
  analyticsTrackSchema,
  ANALYTICS_EVENT_LABELS,
  ANALYTICS_EVENT_TYPES,
  ANALYTICS_MAX_PAYLOAD_BYTES,
} from "@/lib/schemas/analytics";

describe("analyticsTrackSchema", () => {
  it("geçerli event kabul eder", () => {
    const r = analyticsTrackSchema.safeParse({
      eventType: "page_view",
      hotelSlug: "aurelia",
      payload: { path: "/" },
    });
    expect(r.success).toBe(true);
  });

  it("bilinmeyen event reddedilir", () => {
    const r = analyticsTrackSchema.safeParse({ eventType: "spam_event" });
    expect(r.success).toBe(false);
  });

  it("AI tur motoru eventlerini kabul eder", () => {
    for (const eventType of [
      "tour_complete",
      "tour_step_view",
      "ai_tool_price",
      "ai_guard_triggered",
    ] as const) {
      const r = analyticsTrackSchema.safeParse({ eventType, payload: { tourId: "demo" } });
      expect(r.success).toBe(true);
    }
  });

  it("her olay tipinin Türkçe etiketi vardır", () => {
    // Panel/admin ekranları bu haritadan besleniyor; eksik anahtar, ekranda
    // ham event adının görünmesi demek.
    for (const type of ANALYTICS_EVENT_TYPES) {
      expect(ANALYTICS_EVENT_LABELS[type]).toBeTruthy();
    }
  });

  it("aşırı büyük payload reddedilir", () => {
    const big = "x".repeat(ANALYTICS_MAX_PAYLOAD_BYTES + 1);
    const r = analyticsTrackSchema.safeParse({
      eventType: "page_view",
      payload: { data: big },
    });
    expect(r.success).toBe(false);
  });
});

describe("analyticsFunnel", () => {
  it("dönüşümü otel görüntülemesi üzerinden hesaplar", () => {
    const f = analyticsFunnel({ hotel_view: 200, tour_start: 50, inquiry_submit: 10 });
    expect(f.hotelViews).toBe(200);
    expect(f.tourStarts).toBe(50);
    expect(f.conversionRate).toBe(5); // 10/200
  });

  it("otel görüntülemesi yoksa tur başlatmaya düşer", () => {
    const f = analyticsFunnel({ tour_start: 40, inquiry_submit: 4 });
    expect(f.conversionRate).toBe(10); // 4/40
  });

  it("hiç trafik yoksa oran null döner", () => {
    expect(analyticsFunnel({}).conversionRate).toBeNull();
  });

  it("üretilmeyen eski olay adlarına bağlı kalmaz", () => {
    // Eski kod byType.tour_view okuyordu; artık yalnızca gerçekten yayımlanan
    // adlar huniyi besler.
    const f = analyticsFunnel({ tour_view: 999, inquiry_submit: 5 });
    expect(f.conversionRate).toBeNull();
  });
});

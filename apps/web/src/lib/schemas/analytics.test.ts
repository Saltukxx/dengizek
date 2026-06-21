import { describe, expect, it } from "vitest";
import { analyticsTrackSchema, ANALYTICS_MAX_PAYLOAD_BYTES } from "@/lib/schemas/analytics";

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

  it("aşırı büyük payload reddedilir", () => {
    const big = "x".repeat(ANALYTICS_MAX_PAYLOAD_BYTES + 1);
    const r = analyticsTrackSchema.safeParse({
      eventType: "page_view",
      payload: { data: big },
    });
    expect(r.success).toBe(false);
  });
});

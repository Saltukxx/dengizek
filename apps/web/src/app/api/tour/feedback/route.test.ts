import { beforeEach, describe, expect, it, vi } from "vitest";

const trackEventMock = vi.fn();
vi.mock("@/lib/analytics", () => ({ trackEvent: (...a: unknown[]) => trackEventMock(...a) }));
const hotelIdMock = vi.fn();
vi.mock("@/lib/hotels-repo", () => ({ getHotelIdBySlug: (...a: unknown[]) => hotelIdMock(...a) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => true, requestIp: () => "1.1.1.1" }));

import { POST } from "./route";

const post = (body: unknown) => POST(new Request("http://x/api/tour/feedback", { method: "POST", body: JSON.stringify(body) }));
const body = { hotelSlug: "aurelia-bay", tourId: "t1", messageId: "a1", rating: "down", question: "Kese var mı?", answer: "Bilgim yok." };

beforeEach(() => {
  trackEventMock.mockReset();
  hotelIdMock.mockReset().mockResolvedValue("hotel-1");
});

describe("POST /api/tour/feedback", () => {
  it("oy, soru ve cevapla kaydedilir; ziyaret kimliği aktarılır", async () => {
    const res = await post({ ...body, visitId: "7d1f0c3e-2b4a-4c6d-9e8f-0a1b2c3d4e5f" });
    expect(res.status).toBe(200);
    expect(trackEventMock).toHaveBeenCalledWith(
      "ai_feedback",
      expect.objectContaining({ rating: "down", messageId: "a1", question: "Kese var mı?", answer: "Bilgim yok.", topic: "havuz-spa" }),
      "hotel-1",
      "aurelia-bay",
      "7d1f0c3e-2b4a-4c6d-9e8f-0a1b2c3d4e5f",
    );
  });

  it("geçersiz oy ve bilinmeyen otel reddedilir", async () => {
    expect((await post({ ...body, rating: "meh" })).status).toBe(400);
    hotelIdMock.mockResolvedValue(null);
    expect((await post(body)).status).toBe(404);
    expect(trackEventMock).not.toHaveBeenCalled();
  });
});

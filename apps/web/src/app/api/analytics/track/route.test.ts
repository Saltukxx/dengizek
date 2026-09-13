import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  requestIp: vi.fn(),
  trackEvent: vi.fn(),
  isDbConfigured: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  requestIp: mocks.requestIp,
}));
vi.mock("@/lib/analytics", () => ({ trackEvent: mocks.trackEvent }));
vi.mock("@/lib/db", () => ({
  getDb: mocks.getDb,
  isDbConfigured: mocks.isDbConfigured,
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/analytics/track", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: JSON.stringify(body),
  });
}

function makeDb(hotelRows: unknown[]) {
  const limit = vi.fn(async () => hotelRows);
  const where = vi.fn(() => ({ limit }));
  const db = {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where })) })),
  };
  mocks.getDb.mockReturnValue(db);
  return { db, where, limit };
}

describe("analytics track API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requestIp.mockReturnValue("203.0.113.9");
    mocks.checkRateLimit.mockResolvedValue(true);
    mocks.isDbConfigured.mockReturnValue(true);
    mocks.trackEvent.mockResolvedValue(undefined);
  });

  it("IP başına doğru analitik limitini uygular", async () => {
    mocks.checkRateLimit.mockResolvedValue(false);

    const res = await POST(request({ eventType: "hotel_view" }));

    expect(res.status).toBe(429);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("203.0.113.9", {
      name: "analytics",
      windowMs: 60_000,
      limit: 60,
    });
    expect(mocks.trackEvent).not.toHaveBeenCalled();
  });

  it("bilinmeyen olay türünü depolamadan reddeder", async () => {
    const res = await POST(request({ eventType: "made_up_event" }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ ok: false, issues: expect.any(Object) });
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.trackEvent).not.toHaveBeenCalled();
  });

  it("aşırı büyük payload'ı reddeder", async () => {
    const res = await POST(request({ eventType: "page_view", payload: { data: "x".repeat(5000) } }));

    expect(res.status).toBe(400);
    expect(mocks.trackEvent).not.toHaveBeenCalled();
  });

  it("DB yoksa olayı başarı gibi yutmak yerine 503 döner", async () => {
    mocks.isDbConfigured.mockReturnValue(false);

    const res = await POST(request({ eventType: "page_view" }));

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ code: "service_unavailable" });
    expect(mocks.trackEvent).not.toHaveBeenCalled();
  });

  it("otel slug'ını iç kimliğe çözüp payload ile birlikte kaydeder", async () => {
    makeDb([{ id: "hotel-db" }]);
    const payload = { page: "kis-browse", season: "kis", resultCount: 3 };

    const res = await POST(request({ eventType: "page_view", hotelSlug: "kar-zirvesi", payload }));

    expect(res.status).toBe(200);
    expect(mocks.trackEvent).toHaveBeenCalledWith(
      "page_view",
      payload,
      "hotel-db",
      "kar-zirvesi",
    );
  });

  it("bilinmeyen slug için yanlış otele bağlamadan slug bağlamını korur", async () => {
    makeDb([]);

    const res = await POST(request({ eventType: "hotel_view", hotelSlug: "olmayan" }));

    expect(res.status).toBe(200);
    expect(mocks.trackEvent).toHaveBeenCalledWith("hotel_view", {}, null, "olmayan");
  });
});

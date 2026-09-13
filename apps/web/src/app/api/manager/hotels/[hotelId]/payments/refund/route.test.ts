import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireHotelAccess: vi.fn(),
  getDb: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireHotelAccess: mocks.requireHotelAccess }));
vi.mock("@/lib/db", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));

import { POST } from "./route";

const paymentId = "22222222-2222-4222-8222-222222222222";

function queryResult(rows: unknown[]) {
  const result = Promise.resolve(rows) as Promise<unknown[]> & { limit: () => Promise<unknown[]> };
  result.limit = vi.fn(async () => rows);
  return result;
}

function makeDb(payment: Record<string, unknown> | null, updateRows: unknown[][] = []) {
  const updateQueue = [...updateRows];
  const updatedValues = vi.fn();
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => queryResult(payment ? [payment] : [])),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => {
        updatedValues(values);
        return {
          where: vi.fn(() => ({
            returning: vi.fn(async () => updateQueue.shift() ?? []),
          })),
        };
      }),
    })),
  };
  mocks.getDb.mockReturnValue(db);
  return { db, updatedValues };
}

function request(body: unknown = { paymentId }) {
  return new Request("http://localhost/api/payments/refund", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function stripeResponse(data: unknown, ok = true) {
  return { ok, json: vi.fn(async () => data) } as unknown as Response;
}

const paidPayment = {
  id: paymentId,
  bookingId: "booking-1",
  hotelId: "hotel-db",
  amountMinor: 88_500,
  currency: "TRY",
  status: "odendi",
  provider: "stripe",
  providerRef: "pi_paid",
};

describe("payment refund API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PAYMENTS_ENABLED", "true");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_secret");
    mocks.requireHotelAccess.mockResolvedValue({
      response: null,
      hotel: { id: "hotel-db" },
      user: { id: "owner-1", role: "otel_yoneticisi" },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("özellik kapalıyken hiçbir dış bağımlılığa dokunmaz", async () => {
    vi.stubEnv("PAYMENTS_ENABLED", "false");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(request(), { params: Promise.resolve({ hotelId: "hotel-route" }) });

    expect(res.status).toBe(503);
    expect(mocks.requireHotelAccess).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("owner yetkisi ister ve geçersiz paymentId'yi Stripe'tan önce reddeder", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(request({ paymentId: "not-a-uuid" }), {
      params: Promise.resolve({ hotelId: "hotel-route" }),
    });

    expect(res.status).toBe(400);
    expect(mocks.requireHotelAccess).toHaveBeenCalledWith("hotel-route", "owner");
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("daha önce iade edilmiş ödemeyi idempotent başarı olarak döndürür", async () => {
    const payment = { ...paidPayment, status: "iade" };
    makeDb(payment);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(request(), { params: Promise.resolve({ hotelId: "hotel-route" }) });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, idempotent: true, payment });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Stripe dışı bir ödemeyi otomatik iade etmez", async () => {
    makeDb({ ...paidPayment, provider: "manual", providerRef: null });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(request(), { params: Promise.resolve({ hotelId: "hotel-route" }) });

    expect(res.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("Stripe iadesinde idempotency ve tenant metadata'sını gönderip durumu günceller", async () => {
    const refunded = { ...paidPayment, status: "iade" };
    const { updatedValues } = makeDb(paidPayment, [[refunded]]);
    const fetchMock = vi.fn().mockResolvedValue(stripeResponse({ id: "re_123", status: "succeeded" }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(request(), { params: Promise.resolve({ hotelId: "hotel-route" }) });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, payment: refunded, refundRef: "re_123" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/refunds");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer sk_test_secret",
      "Idempotency-Key": `refund:${paymentId}`,
    });
    expect(Object.fromEntries((init.body as URLSearchParams).entries())).toEqual({
      payment_intent: "pi_paid",
      "metadata[paymentId]": paymentId,
      "metadata[hotelId]": "hotel-db",
    });
    expect(updatedValues).toHaveBeenCalledWith({ status: "iade" });
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "odeme.iade-edildi",
        entityId: "booking-1",
        meta: expect.objectContaining({ refundRef: "re_123" }),
      }),
    );
  });

  it("sağlayıcı zaten iade edilmiş derse yerel kaydı senkronlar", async () => {
    const synced = { ...paidPayment, status: "iade" };
    const { updatedValues } = makeDb(paidPayment, [[synced]]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        stripeResponse({ error: { code: "charge_already_refunded", message: "already" } }, false),
      ),
    );

    const res = await POST(request(), { params: Promise.resolve({ hotelId: "hotel-route" }) });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, synced: true, payment: synced });
    expect(updatedValues).toHaveBeenCalledWith({ status: "iade" });
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("Stripe hatasında yerel ödeme durumunu değiştirmez", async () => {
    const { updatedValues } = makeDb(paidPayment);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(stripeResponse({ error: { message: "refund failed" } }, false)),
    );

    const res = await POST(request(), { params: Promise.resolve({ hotelId: "hotel-route" }) });

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({ error: "refund failed" });
    expect(updatedValues).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
});

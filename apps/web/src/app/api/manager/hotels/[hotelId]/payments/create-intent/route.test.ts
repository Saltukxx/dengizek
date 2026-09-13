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

const bookingId = "11111111-1111-4111-8111-111111111111";

function queryResult(rows: unknown[]) {
  const result = Promise.resolve(rows) as Promise<unknown[]> & { limit: () => Promise<unknown[]> };
  result.limit = vi.fn(async () => rows);
  return result;
}

function makeDb(selectRows: unknown[][]) {
  const queue = [...selectRows];
  const insertedValues = vi.fn();
  const updatedValues = vi.fn();
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => queryResult(queue.shift() ?? [])),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => {
        insertedValues(values);
        return { returning: vi.fn(async () => [{ id: "payment-new", ...values }]) };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => {
        updatedValues(values);
        return { where: vi.fn(async () => []) };
      }),
    })),
  };
  mocks.getDb.mockReturnValue(db);
  return { db, insertedValues, updatedValues };
}

function request(body: unknown = { bookingId }) {
  return new Request("http://localhost/api/payments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function stripeResponse(data: unknown, ok = true) {
  return { ok, json: vi.fn(async () => data) } as unknown as Response;
}

describe("payment intent API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PAYMENTS_ENABLED", "true");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_secret");
    mocks.requireHotelAccess.mockResolvedValue({
      response: null,
      hotel: { id: "hotel-db" },
      user: { id: "user-1", role: "otel_yoneticisi" },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("özellik kapalıyken erişim, DB veya Stripe'a dokunmadan 503 döner", async () => {
    vi.stubEnv("PAYMENTS_ENABLED", "false");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(request({}), { params: Promise.resolve({ hotelId: "hotel-route" }) });

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ ok: false, code: "PAYMENTS_DISABLED" });
    expect(mocks.requireHotelAccess).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("finansal işlem için owner erişimi ister ve reddi aynen döndürür", async () => {
    const denied = Response.json({ ok: false }, { status: 403 });
    mocks.requireHotelAccess.mockResolvedValue({ response: denied });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(request(), { params: Promise.resolve({ hotelId: "hotel-route" }) });

    expect(res.status).toBe(403);
    expect(mocks.requireHotelAccess).toHaveBeenCalledWith("hotel-route", "owner");
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tutarı istemciden değil rezervasyondan alır ve idempotent Stripe isteği kaydeder", async () => {
    const booking = { id: bookingId, status: "onaylandi", totalMinor: 123_400, currency: "TRY" };
    const { insertedValues } = makeDb([[booking], []]);
    const fetchMock = vi.fn().mockResolvedValue(
      stripeResponse({ id: "pi_new", client_secret: "secret_new" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(request({ bookingId, amount: 1, currency: "USD" }), {
      params: Promise.resolve({ hotelId: "hotel-route" }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, clientSecret: "secret_new" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/payment_intents");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer sk_test_secret",
      "Idempotency-Key": `pi:${bookingId}:123400:TRY`,
    });
    expect(Object.fromEntries((init.body as URLSearchParams).entries())).toEqual({
      amount: "123400",
      currency: "try",
      "metadata[bookingId]": bookingId,
      "metadata[hotelId]": "hotel-db",
    });
    expect(insertedValues).toHaveBeenCalledWith({
      bookingId,
      hotelId: "hotel-db",
      amountMinor: 123_400,
      currency: "TRY",
      status: "beklemede",
      provider: "stripe",
      providerRef: "pi_new",
    });
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "odeme.intent-olusturuldu", entityId: bookingId }),
    );
  });

  it("ödenmiş rezervasyon için ikinci Stripe isteğini engeller", async () => {
    const booking = { id: bookingId, status: "onaylandi", totalMinor: 9_900, currency: "TRY" };
    makeDb([[booking], [{ id: "payment-paid", status: "odendi" }]]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(request(), { params: Promise.resolve({ hotelId: "hotel-route" }) });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ code: "ALREADY_PAID" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tutarı değişmemiş açık intent'i yeniden kullanır", async () => {
    const booking = { id: bookingId, status: "onaylandi", totalMinor: 45_000, currency: "EUR" };
    const openPayment = {
      id: "payment-open",
      status: "beklemede",
      provider: "stripe",
      providerRef: "pi_open",
    };
    const { insertedValues } = makeDb([[booking], [openPayment]]);
    const fetchMock = vi.fn().mockResolvedValue(
      stripeResponse({
        id: "pi_open",
        client_secret: "secret_existing",
        status: "requires_payment_method",
        amount: 45_000,
        currency: "eur",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(request(), { params: Promise.resolve({ hotelId: "hotel-route" }) });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      clientSecret: "secret_existing",
      payment: openPayment,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.stripe.com/v1/payment_intents/pi_open",
      expect.objectContaining({ method: "GET" }),
    );
    expect(insertedValues).not.toHaveBeenCalled();
  });

  it("Stripe intent oluşturamazsa DB'ye ödeme yazmaz", async () => {
    const booking = { id: bookingId, status: "onaylandi", totalMinor: 10_000, currency: "TRY" };
    const { insertedValues } = makeDb([[booking], []]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(stripeResponse({ error: { message: "provider down" } }, false)),
    );

    const res = await POST(request(), { params: Promise.resolve({ hotelId: "hotel-route" }) });

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({ error: "provider down" });
    expect(insertedValues).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
});

import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: mocks.getDb }));

import { verifyStripeSignature } from "@/lib/stripe-webhook";
import { POST } from "./route";

const SECRET = "whsec_test";

function sign(payload: string, ts: number, secret = SECRET): string {
  return createHmac("sha256", secret).update(`${ts}.${payload}`, "utf8").digest("hex");
}

describe("Stripe webhook imza", () => {
  const payload = '{"id":"evt_1"}';
  const now = 1_700_000_000;

  it("geçerli imzayı doğrular", () => {
    const sig = sign(payload, now);
    expect(verifyStripeSignature(payload, `t=${now},v1=${sig}`, SECRET, now)).toBe(true);
  });

  it("hatalı imzayı reddeder", () => {
    expect(verifyStripeSignature("{}", `t=${now},v1=bad`, SECRET, now)).toBe(false);
  });

  it("tolerans dışı (eski) zaman damgasını reddeder — replay koruması", () => {
    const oldTs = now - 600;
    const sig = sign(payload, oldTs);
    expect(verifyStripeSignature(payload, `t=${oldTs},v1=${sig}`, SECRET, now)).toBe(false);
  });

  it("tolerans içindeki zaman damgasını kabul eder", () => {
    const ts = now - 200;
    const sig = sign(payload, ts);
    expect(verifyStripeSignature(payload, `t=${ts},v1=${sig}`, SECRET, now)).toBe(true);
  });

  it("anahtar rotasyonunda birden çok v1 imzasından herhangi biri yeterli", () => {
    const goodSig = sign(payload, now);
    const staleSig = sign(payload, now, "whsec_old");
    const header = `t=${now},v1=${staleSig},v1=${goodSig}`;
    expect(verifyStripeSignature(payload, header, SECRET, now)).toBe(true);
  });

  it("t veya v1 eksikse reddeder", () => {
    expect(verifyStripeSignature(payload, `v1=${sign(payload, now)}`, SECRET, now)).toBe(false);
    expect(verifyStripeSignature(payload, `t=${now}`, SECRET, now)).toBe(false);
  });

  it("sayısal olmayan zaman damgasını reddeder", () => {
    const sig = sign(payload, now);
    expect(verifyStripeSignature(payload, `t=abc,v1=${sig}`, SECRET, now)).toBe(false);
  });
});

function queryResult(rows: unknown[]) {
  const result = Promise.resolve(rows) as Promise<unknown[]> & { limit: () => Promise<unknown[]> };
  result.limit = vi.fn(async () => rows);
  return result;
}

function makeDb(payment: Record<string, unknown> | null, updatedRows: unknown[] = []) {
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
            returning: vi.fn(async () => updatedRows),
          })),
        };
      }),
    })),
  };
  mocks.getDb.mockReturnValue(db);
  return { db, updatedValues };
}

function webhookRequest(event: unknown, validSignature = true) {
  const payload = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  const signature = validSignature ? sign(payload, ts) : "invalid";
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": `t=${ts},v1=${signature}` },
    body: payload,
  });
}

const payment = {
  id: "payment-1",
  bookingId: "booking-1",
  hotelId: "hotel-1",
  amountMinor: 32_500,
  currency: "TRY",
  status: "beklemede",
  providerRef: "pi_123",
};

function succeededEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_success",
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: "pi_123",
        amount: 32_500,
        currency: "try",
        metadata: { hotelId: "hotel-1", bookingId: "booking-1" },
        ...overrides,
      },
    },
  };
}

describe("Stripe webhook API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PAYMENTS_ENABLED", "true");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ödemeler kapalıyken 200 döner ve DB'ye dokunmaz", async () => {
    vi.stubEnv("PAYMENTS_ENABLED", "false");

    const res = await POST(webhookRequest(succeededEvent()));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      ignored: true,
      reason: "PAYMENTS_DISABLED",
    });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("geçersiz imzalı olayda DB'ye dokunmaz", async () => {
    const res = await POST(webhookRequest(succeededEvent(), false));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "Geçersiz imza." });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("tenant veya rezervasyon metadata'sı uyuşmazsa ödeme durumunu değiştirmez", async () => {
    const { db, updatedValues } = makeDb(payment);
    const res = await POST(
      webhookRequest(
        succeededEvent({ metadata: { hotelId: "other-hotel", bookingId: "booking-1" } }),
      ),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "Otel metadata uyuşmazlığı." });
    expect(db.update).not.toHaveBeenCalled();
    expect(updatedValues).not.toHaveBeenCalled();
  });

  it("başarılı olayda tutar ve para birimini doğrulayıp ödemeyi günceller", async () => {
    const { updatedValues } = makeDb(payment, [{ ...payment, status: "odendi" }]);

    const res = await POST(webhookRequest(succeededEvent()));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      paymentId: "payment-1",
      status: "odendi",
    });
    expect(updatedValues).toHaveBeenCalledWith({ status: "odendi" });
  });

  it("başarılı olayın tutarı DB kaydıyla uyuşmazsa güncellemez", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { db } = makeDb(payment);

    const res = await POST(webhookRequest(succeededEvent({ amount: 1 })));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "Tutar uyuşmazlığı." });
    expect(db.update).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it("aynı duruma gelen tekrar olayı idempotent kabul eder", async () => {
    const { db } = makeDb({ ...payment, status: "odendi" });

    const res = await POST(webhookRequest(succeededEvent()));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, idempotent: true });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("geç gelen başarısız olay terminal ödemeyi geri alamaz", async () => {
    const { updatedValues } = makeDb({ ...payment, status: "odendi" }, []);
    const event = {
      id: "evt_failed",
      type: "payment_intent.payment_failed",
      data: { object: { id: "pi_123" } },
    };

    const res = await POST(webhookRequest(event));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ignored: true,
      reason: "TERMINAL_STATUS",
    });
    expect(updatedValues).toHaveBeenCalledWith({ status: "basarisiz" });
  });

  it("charge.refunded olayını payment_intent üzerinden iade durumuna taşır", async () => {
    const { updatedValues } = makeDb(
      { ...payment, status: "odendi" },
      [{ ...payment, status: "iade" }],
    );
    const event = {
      id: "evt_refund",
      type: "charge.refunded",
      data: { object: { id: "ch_123", payment_intent: "pi_123" } },
    };

    const res = await POST(webhookRequest(event));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ status: "iade" });
    expect(updatedValues).toHaveBeenCalledWith({ status: "iade" });
  });
});

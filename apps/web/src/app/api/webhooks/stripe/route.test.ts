import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyStripeSignature } from "@/lib/stripe-webhook";

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

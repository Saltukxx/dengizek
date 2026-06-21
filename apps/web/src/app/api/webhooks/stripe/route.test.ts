import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

function verifyStripeSignature(payload: string, signatureHeader: string, secret: string): boolean {
  const parts = signatureHeader.split(",").reduce<Record<string, string>>((acc, part) => {
    const [k, v] = part.split("=");
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});

  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const expected = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  return expected === signature;
}

describe("Stripe webhook imza", () => {
  it("geçerli imzayı doğrular", () => {
    const secret = "whsec_test";
    const payload = '{"id":"evt_1"}';
    const ts = "1234567890";
    const sig = createHmac("sha256", secret).update(`${ts}.${payload}`, "utf8").digest("hex");
    const header = `t=${ts},v1=${sig}`;
    expect(verifyStripeSignature(payload, header, secret)).toBe(true);
  });

  it("hatalı imzayı reddeder", () => {
    expect(verifyStripeSignature("{}", "t=1,v1=bad", "secret")).toBe(false);
  });
});

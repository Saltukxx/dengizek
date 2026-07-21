// ---------------------------------------------------------------------------
// Stripe webhook imza doğrulaması (stripe-signature başlığı).
// - HMAC-SHA256 + sabit-zamanlı karşılaştırma
// - Anahtar rotasyonu: başlıktaki TÜM v1 imzaları denenir
// - ±SIGNATURE_TOLERANCE_SEC zaman toleransı — yakalanmış imzalı gövdenin
//   sonradan tekrar oynatılmasını (replay) engeller
// ---------------------------------------------------------------------------

import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_TOLERANCE_SEC = 300;

export function verifyStripeSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  let timestamp: string | null = null;
  const candidateSignatures: string[] = [];
  for (const part of signatureHeader.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") timestamp = value;
    if (key === "v1") candidateSignatures.push(value);
  }

  if (!timestamp || candidateSignatures.length === 0) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > SIGNATURE_TOLERANCE_SEC) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const expected = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  const expectedBuf = Buffer.from(expected);

  return candidateSignatures.some((sig) => {
    const sigBuf = Buffer.from(sig);
    if (sigBuf.length !== expectedBuf.length) return false;
    try {
      return timingSafeEqual(expectedBuf, sigBuf);
    } catch {
      return false;
    }
  });
}

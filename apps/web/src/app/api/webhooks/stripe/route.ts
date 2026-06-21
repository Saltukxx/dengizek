// ---------------------------------------------------------------------------
// POST /api/webhooks/stripe — PaymentIntent durum güncellemeleri
// ---------------------------------------------------------------------------

import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { paymentsTable } from "@/lib/db/schema";
import { apiFail, apiOk } from "@/lib/api-response";

const HANDLED_EVENTS = new Set([
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
]);

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

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

function mapStripeStatus(eventType: string): "odendi" | "basarisiz" | "beklemede" {
  if (eventType === "payment_intent.succeeded") return "odendi";
  if (eventType === "payment_intent.payment_failed") return "basarisiz";
  return "beklemede";
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return apiFail("Webhook yapılandırılmamış.", 503);
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return apiFail("İmza başlığı eksik.", 400);
  }

  const payload = await req.text();
  if (!verifyStripeSignature(payload, signature, secret)) {
    return apiFail("Geçersiz imza.", 400);
  }

  let event: { id?: string; type?: string; data?: { object?: { id?: string; metadata?: Record<string, string> } } };
  try {
    event = JSON.parse(payload) as typeof event;
  } catch {
    return apiFail("Geçersiz JSON.", 400);
  }

  if (!event.type || !HANDLED_EVENTS.has(event.type)) {
    return apiOk({ received: true, ignored: true });
  }

  const intent = event.data?.object;
  const providerRef = intent?.id;
  if (!providerRef) {
    return apiFail("PaymentIntent id eksik.", 400);
  }

  const db = getDb();
  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.providerRef, providerRef))
    .limit(1);

  if (!payment) {
    return apiOk({ received: true, matched: false });
  }

  const nextStatus = mapStripeStatus(event.type);
  if (payment.status === nextStatus) {
    return apiOk({ received: true, idempotent: true });
  }

  const metaHotelId = intent?.metadata?.hotelId;
  if (metaHotelId && metaHotelId !== payment.hotelId) {
    return apiFail("Otel metadata uyuşmazlığı.", 400);
  }

  await db
    .update(paymentsTable)
    .set({ status: nextStatus })
    .where(and(eq(paymentsTable.id, payment.id), eq(paymentsTable.providerRef, providerRef)));

  return apiOk({ received: true, paymentId: payment.id, status: nextStatus });
}

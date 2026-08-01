// ---------------------------------------------------------------------------
// POST /api/webhooks/stripe — PaymentIntent durum güncellemeleri
//
// Güvenlik / doğruluk garantileri:
//  - İmza: HMAC-SHA256 + sabit-zamanlı karşılaştırma, TÜM v1 imzaları denenir
//    (anahtar rotasyonunda Stripe iki imza gönderir) ve ±5 dk zaman toleransı
//    uygulanır (yakalanmış imzalı gövdenin tekrar oynatılmasını engeller).
//  - Durum makinesi monotoniktir: "odendi" webhook ile asla geri alınamaz —
//    yalnızca açık iade akışı "iade"ye çevirebilir. Geç gelen/ters sıralı
//    payment_failed/canceled olayları ödenmiş kaydı bozamaz.
//  - Tutar doğrulaması: intent amount/currency ödeme kaydıyla uyuşmalı.
//  - Ödeme özelliği kapalıyken 200 döner (ignored) — 503 Stripe'ın retry
//    fırtınasını tetikler.
// ---------------------------------------------------------------------------

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { paymentsTable } from "@/lib/db/schema";
import { apiFail, apiOk } from "@/lib/api-response";
import { verifyStripeSignature } from "@/lib/stripe-webhook";

const HANDLED_EVENTS = new Set([
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
  // Stripe panelinden yapılan iade de DB'ye yansımalı — aksi halde ödeme
  // "odendi" kalır ve rezervasyon iptali payment_conflict ile kilitlenir.
  "charge.refunded",
]);

function mapStripeStatus(eventType: string): "odendi" | "basarisiz" | "iade" {
  if (eventType === "payment_intent.succeeded") return "odendi";
  if (eventType === "charge.refunded") return "iade";
  // payment_failed ve canceled: intent bu haliyle tahsil edilemez.
  return "basarisiz";
}

export async function POST(req: Request) {
  if (process.env.PAYMENTS_ENABLED !== "true") {
    // 200: özellik kapalıyken Stripe retry kuyruğu büyümesin.
    return apiOk({ received: true, ignored: true, reason: "PAYMENTS_DISABLED" });
  }
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

  let event: {
    id?: string;
    type?: string;
    data?: {
      object?: {
        id?: string;
        amount?: number;
        currency?: string;
        metadata?: Record<string, string>;
        /** charge.* olaylarında dolu — nesne Charge'dır, PaymentIntent değil. */
        payment_intent?: string;
      };
    };
  };
  try {
    event = JSON.parse(payload) as typeof event;
  } catch {
    return apiFail("Geçersiz JSON.", 400);
  }

  if (!event.type || !HANDLED_EVENTS.has(event.type)) {
    return apiOk({ received: true, ignored: true });
  }

  const intent = event.data?.object;
  // charge.refunded'da data.object bir Charge'dır: kaydımız PaymentIntent id'si
  // ile eşleştiği için oradaki payment_intent alanı kullanılır.
  const providerRef = event.type.startsWith("charge.")
    ? intent?.payment_intent
    : intent?.id;
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

  // Metadata / tutar doğrulaması — intent kaydımızla uyuşmalı.
  const metaHotelId = intent?.metadata?.hotelId;
  if (metaHotelId && metaHotelId !== payment.hotelId) {
    return apiFail("Otel metadata uyuşmazlığı.", 400);
  }
  const metaBookingId = intent?.metadata?.bookingId;
  if (metaBookingId && payment.bookingId && metaBookingId !== payment.bookingId) {
    return apiFail("Rezervasyon metadata uyuşmazlığı.", 400);
  }
  if (
    event.type === "payment_intent.succeeded" &&
    (intent?.amount !== payment.amountMinor ||
      intent?.currency?.toLowerCase() !== payment.currency.toLowerCase())
  ) {
    console.error(
      `[stripe-webhook] Tutar uyuşmazlığı: payment=${payment.id} beklenen=${payment.amountMinor} ${payment.currency}, intent=${intent?.amount} ${intent?.currency}`,
    );
    return apiFail("Tutar uyuşmazlığı.", 400);
  }

  const nextStatus = mapStripeStatus(event.type);
  if (payment.status === nextStatus) {
    return apiOk({ received: true, idempotent: true });
  }

  // Monotonik geçiş: yalnızca izin verilen kaynak durumlardan güncelle.
  // Normalde "odendi" ve "iade" webhook ile değişmez; tek istisna iadedir —
  // tahsil edilmiş bir ödeme Stripe panelinden iade edilebilir ve bunu
  // yansıtmazsak rezervasyon iptali kalıcı olarak kilitlenir.
  // Koşul WHERE'de olduğu için eşzamanlı teslimatlarda da yarış olmaz.
  const allowedFrom: ("beklemede" | "basarisiz" | "odendi")[] =
    nextStatus === "iade" ? ["odendi", "beklemede"] : ["beklemede", "basarisiz"];

  const updated = await db
    .update(paymentsTable)
    .set({ status: nextStatus })
    .where(
      and(
        eq(paymentsTable.id, payment.id),
        eq(paymentsTable.providerRef, providerRef),
        inArray(paymentsTable.status, allowedFrom),
      ),
    )
    .returning();

  if (updated.length === 0) {
    // Terminal durumda — geç gelen olay yok sayılır.
    return apiOk({ received: true, ignored: true, reason: "TERMINAL_STATUS" });
  }

  return apiOk({ received: true, paymentId: payment.id, status: nextStatus });
}

// ---------------------------------------------------------------------------
// POST .../payments/refund — ödenmiş rezervasyon tahsilatının tam iadesi.
//
// - Yalnızca "odendi" durumundaki Stripe ödemeleri iade edilebilir.
// - Stripe /v1/refunds çağrısı Idempotency-Key taşır (tekrar denemede çift
//   iade oluşmaz); başarıda ödeme kaydı "iade" durumuna geçer.
// - İade sonrası rezervasyon iptali serbest kalır (bkz. releaseApprovedBooking
//   payment_conflict koruması).
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { paymentsTable } from "@/lib/db/schema";
import { logAudit } from "@/lib/audit";

type RouteParams = { params: Promise<{ hotelId: string }> };

const refundSchema = z.object({
  paymentId: z.string().uuid(),
});

export async function POST(req: Request, { params }: RouteParams) {
  if (process.env.PAYMENTS_ENABLED !== "true") {
    return NextResponse.json(
      { ok: false, code: "PAYMENTS_DISABLED", error: "Ödeme özelliği şu anda kapalı." },
      { status: 503 },
    );
  }
  const { hotelId } = await params;
  // İade finansal işlem — editor üyeliği yetmez.
  const guard = await requireHotelAccess(hotelId, "owner");
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = refundSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json(
      { ok: false, code: "PAYMENTS_DISABLED", error: "Ödeme sağlayıcısı yapılandırılmamış." },
      { status: 503 },
    );
  }

  const db = getDb();
  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(
      and(eq(paymentsTable.id, parsed.data.paymentId), eq(paymentsTable.hotelId, guard.hotel.id)),
    )
    .limit(1);

  if (!payment) {
    return NextResponse.json({ ok: false, error: "Ödeme kaydı bulunamadı." }, { status: 404 });
  }
  if (payment.status === "iade") {
    return NextResponse.json({ ok: true, payment, idempotent: true });
  }
  if (payment.status !== "odendi") {
    return NextResponse.json(
      { ok: false, error: "Yalnızca tahsil edilmiş ödemeler iade edilebilir." },
      { status: 409 },
    );
  }
  if (payment.provider !== "stripe" || !payment.providerRef) {
    return NextResponse.json(
      { ok: false, error: "Bu ödeme Stripe üzerinden yapılmamış — iade manuel yapılmalı." },
      { status: 409 },
    );
  }

  const res = await fetch("https://api.stripe.com/v1/refunds", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `refund:${payment.id}`,
    },
    body: new URLSearchParams({
      payment_intent: payment.providerRef,
      "metadata[paymentId]": payment.id,
      "metadata[hotelId]": guard.hotel.id,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    status?: string;
    error?: { message: string; code?: string };
  };

  if (!res.ok) {
    // Stripe tarafında zaten iade edilmişse durumu senkronla.
    if (data.error?.code === "charge_already_refunded") {
      const [synced] = await db
        .update(paymentsTable)
        .set({ status: "iade" })
        .where(and(eq(paymentsTable.id, payment.id), eq(paymentsTable.status, "odendi")))
        .returning();
      return NextResponse.json({ ok: true, payment: synced ?? payment, synced: true });
    }
    return NextResponse.json(
      { ok: false, error: data.error?.message ?? "Stripe iade hatası." },
      { status: 502 },
    );
  }

  const [updated] = await db
    .update(paymentsTable)
    .set({ status: "iade" })
    .where(and(eq(paymentsTable.id, payment.id), eq(paymentsTable.status, "odendi")))
    .returning();

  await logAudit({
    actor: guard.user,
    action: "odeme.iade-edildi",
    entityType: "hotel",
    entityId: payment.bookingId ?? payment.id,
    meta: {
      hotelId: guard.hotel.id,
      paymentId: payment.id,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      refundRef: data.id,
    },
  });

  return NextResponse.json({ ok: true, payment: updated ?? payment, refundRef: data.id });
}

// ---------------------------------------------------------------------------
// POST .../payments/create-intent — rezervasyon tahsilatı için Stripe
// PaymentIntent oluşturur.
//
// Güvenlik modeli:
//  - Tutar/para birimi İSTEMCİDEN ALINMAZ — rezervasyonun DB'deki
//    totalMinor/currency değerlerinden okunur.
//  - Yalnızca "onaylandi" durumundaki rezervasyonlar tahsil edilebilir.
//  - Ödenmiş rezervasyon ikinci kez tahsil edilemez (409).
//  - Açık (beklemede) intent varsa yenisi yaratılmaz; tutar hâlâ uyuşuyorsa
//    aynı intent'in clientSecret'ı döner, uyuşmuyorsa eski intent Stripe'ta
//    iptal edilip yenisi açılır.
//  - Stripe çağrısı Idempotency-Key taşır — ağ hatası sonrası tekrar denemede
//    çift intent oluşmaz.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { bookingsTable, paymentsTable } from "@/lib/db/schema";
import { paymentIntentSchema } from "@/lib/schemas/hotel-panel";
import { currencies } from "@/lib/price";
import { logAudit } from "@/lib/audit";

type RouteParams = { params: Promise<{ hotelId: string }> };

interface StripeIntent {
  id?: string;
  client_secret?: string | null;
  status?: string;
  amount?: number;
  currency?: string;
  error?: { message: string };
}

async function stripeRequest(
  stripeKey: string,
  path: string,
  body?: URLSearchParams,
  idempotencyKey?: string,
): Promise<{ ok: boolean; data: StripeIntent }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${stripeKey}`,
  };
  if (body) headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: body ? "POST" : "GET",
    headers,
    body,
  });
  const data = (await res.json().catch(() => ({}))) as StripeIntent;
  return { ok: res.ok, data };
}

export async function POST(req: Request, { params }: RouteParams) {
  if (process.env.PAYMENTS_ENABLED !== "true") {
    return NextResponse.json(
      { ok: false, code: "PAYMENTS_DISABLED", error: "Ödeme özelliği şu anda kapalı." },
      { status: 503 },
    );
  }
  const { hotelId } = await params;
  // Tahsilat finansal işlem — editor üyeliği yetmez.
  const guard = await requireHotelAccess(hotelId, "owner");
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = paymentIntentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const [booking] = await db
    .select({
      id: bookingsTable.id,
      status: bookingsTable.status,
      totalMinor: bookingsTable.totalMinor,
      currency: bookingsTable.currency,
    })
    .from(bookingsTable)
    .where(
      and(eq(bookingsTable.id, parsed.data.bookingId), eq(bookingsTable.hotelId, guard.hotel.id)),
    )
    .limit(1);
  if (!booking) {
    return NextResponse.json({ ok: false, error: "Rezervasyon bulunamadı." }, { status: 404 });
  }

  // Tutar ve para birimi yalnızca sunucudaki rezervasyon kaydından gelir.
  if (booking.status !== "onaylandi") {
    return NextResponse.json(
      { ok: false, error: "Yalnızca onaylı rezervasyonlar için tahsilat başlatılabilir." },
      { status: 409 },
    );
  }
  if (booking.totalMinor == null || booking.totalMinor <= 0) {
    return NextResponse.json(
      { ok: false, error: "Rezervasyonun toplam tutarı tanımlı değil." },
      { status: 400 },
    );
  }
  if (!(currencies as readonly string[]).includes(booking.currency)) {
    return NextResponse.json(
      { ok: false, error: `Desteklenmeyen para birimi: ${booking.currency}` },
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

  // Mevcut ödemeler: ödenmişse dur; açık intent varsa yeniden kullan.
  const existingPayments = await db
    .select()
    .from(paymentsTable)
    .where(
      and(
        eq(paymentsTable.bookingId, booking.id),
        inArray(paymentsTable.status, ["odendi", "beklemede"]),
      ),
    );

  if (existingPayments.some((p) => p.status === "odendi")) {
    return NextResponse.json(
      { ok: false, code: "ALREADY_PAID", error: "Bu rezervasyonun tahsilatı zaten yapılmış." },
      { status: 409 },
    );
  }

  const openPayment = existingPayments.find(
    (p) => p.status === "beklemede" && p.provider === "stripe" && p.providerRef,
  );
  if (openPayment?.providerRef) {
    const { ok, data } = await stripeRequest(stripeKey, `/payment_intents/${openPayment.providerRef}`);
    const reusable =
      ok &&
      data.client_secret &&
      data.status !== "canceled" &&
      data.status !== "succeeded" &&
      data.amount === booking.totalMinor &&
      data.currency === booking.currency.toLowerCase();

    if (reusable) {
      return NextResponse.json({ ok: true, payment: openPayment, clientSecret: data.client_secret });
    }

    // Tutar değişmiş veya intent kullanılamaz durumda — Stripe'ta iptal et,
    // kaydı kapat, aşağıda yenisini aç.
    if (ok && data.status !== "canceled" && data.status !== "succeeded") {
      await stripeRequest(stripeKey, `/payment_intents/${openPayment.providerRef}/cancel`, new URLSearchParams());
    }
    await db
      .update(paymentsTable)
      .set({ status: "basarisiz" })
      .where(eq(paymentsTable.id, openPayment.id));
  }

  const { ok, data } = await stripeRequest(
    stripeKey,
    "/payment_intents",
    new URLSearchParams({
      amount: String(booking.totalMinor),
      currency: booking.currency.toLowerCase(),
      "metadata[bookingId]": booking.id,
      "metadata[hotelId]": guard.hotel.id,
    }),
    // Aynı rezervasyon + tutar için tekrar denemeler aynı intent'i döndürür.
    `pi:${booking.id}:${booking.totalMinor}:${booking.currency}`,
  );
  if (!ok || !data.id) {
    return NextResponse.json(
      { ok: false, error: data.error?.message ?? "Stripe hatası." },
      { status: 502 },
    );
  }

  const [payment] = await db
    .insert(paymentsTable)
    .values({
      bookingId: booking.id,
      hotelId: guard.hotel.id,
      amountMinor: booking.totalMinor,
      currency: booking.currency,
      status: "beklemede",
      provider: "stripe",
      providerRef: data.id,
    })
    .returning();

  await logAudit({
    actor: guard.user,
    action: "odeme.intent-olusturuldu",
    entityType: "hotel",
    entityId: booking.id,
    meta: { hotelId: guard.hotel.id, amountMinor: booking.totalMinor, currency: booking.currency, providerRef: data.id },
  });

  return NextResponse.json({ ok: true, payment, clientSecret: data.client_secret ?? null });
}

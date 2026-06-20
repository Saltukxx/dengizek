// ---------------------------------------------------------------------------
// POST .../payments/create-intent — Stripe stub (STRIPE_SECRET_KEY varsa)
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { bookingsTable, paymentsTable } from "@/lib/db/schema";
import { paymentIntentSchema } from "@/lib/schemas/hotel-panel";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
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
    .select({ id: bookingsTable.id })
    .from(bookingsTable)
    .where(
      and(eq(bookingsTable.id, parsed.data.bookingId), eq(bookingsTable.hotelId, guard.hotel.id)),
    )
    .limit(1);
  if (!booking) {
    return NextResponse.json({ ok: false, error: "Rezervasyon bulunamadı." }, { status: 404 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  let providerRef: string;
  let clientSecret: string | null = null;

  if (stripeKey) {
    const res = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        amount: String(parsed.data.amountMinor),
        currency: parsed.data.currency.toLowerCase(),
        "metadata[bookingId]": parsed.data.bookingId,
        "metadata[hotelId]": guard.hotel.id,
      }),
    });
    const stripeData = await res.json() as { id?: string; client_secret?: string; error?: { message: string } };
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: stripeData.error?.message ?? "Stripe hatası." },
        { status: 502 },
      );
    }
    providerRef = stripeData.id!;
    clientSecret = stripeData.client_secret ?? null;
  } else {
    providerRef = `stub_${Date.now()}`;
  }

  const [payment] = await db
    .insert(paymentsTable)
    .values({
      bookingId: parsed.data.bookingId,
      hotelId: guard.hotel.id,
      amountMinor: parsed.data.amountMinor,
      currency: parsed.data.currency,
      status: "beklemede",
      provider: stripeKey ? "stripe" : "stub",
      providerRef,
    })
    .returning();

  return NextResponse.json({
    ok: true,
    payment,
    clientSecret,
    stub: !stripeKey,
  });
}

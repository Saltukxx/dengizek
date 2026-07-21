// ---------------------------------------------------------------------------
// GET /api/admin/payments — platform genelinde tüm ödeme kayıtları (salt okunur)
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, desc, eq, count, sql, type SQL } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { paymentsTable, paymentStatusEnum, hotelsTable } from "@/lib/db/schema";

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const url = new URL(req.url);
  const durum = url.searchParams.get("durum");
  const hotelId = url.searchParams.get("hotelId");
  const sayfa = Math.max(1, Number(url.searchParams.get("sayfa") ?? "1") || 1);
  const limit = 50;

  const isValidStatus = (v: string): v is (typeof paymentStatusEnum.enumValues)[number] =>
    (paymentStatusEnum.enumValues as readonly string[]).includes(v);

  const filters: SQL[] = [];
  if (durum && isValidStatus(durum)) filters.push(eq(paymentsTable.status, durum));
  if (hotelId) filters.push(eq(paymentsTable.hotelId, hotelId));

  const db = getDb();
  const base = db
    .select({
      id: paymentsTable.id,
      bookingId: paymentsTable.bookingId,
      hotelId: paymentsTable.hotelId,
      hotelName: hotelsTable.name,
      hotelSlug: hotelsTable.slug,
      amountMinor: paymentsTable.amountMinor,
      currency: paymentsTable.currency,
      platformFeeMinor: paymentsTable.platformFeeMinor,
      status: paymentsTable.status,
      provider: paymentsTable.provider,
      providerRef: paymentsTable.providerRef,
      createdAt: paymentsTable.createdAt,
    })
    .from(paymentsTable)
    .innerJoin(hotelsTable, eq(paymentsTable.hotelId, hotelsTable.id));

  const payments = await (filters.length > 0 ? base.where(and(...filters)) : base)
    .orderBy(desc(paymentsTable.createdAt))
    .limit(limit)
    .offset((sayfa - 1) * limit);

  const countQuery = db.select({ value: count() }).from(paymentsTable);
  const [countRow] = filters.length > 0 ? await countQuery.where(and(...filters)) : await countQuery;
  const totalCount = Number(countRow?.value ?? 0);

  const paidRows = await db
    .select({ amountMinor: paymentsTable.amountMinor, currency: paymentsTable.currency })
    .from(paymentsTable)
    .where(and(eq(paymentsTable.status, "odendi"), sql`${paymentsTable.provider} <> 'stub'`));
  const totalsByCurrency = paidRows.reduce<Record<string, number>>((totals, p) => {
    totals[p.currency] = (totals[p.currency] ?? 0) + p.amountMinor;
    return totals;
  }, {});

  const hotels = await db
    .select({ id: hotelsTable.id, name: hotelsTable.name })
    .from(hotelsTable)
    .orderBy(hotelsTable.name);

  return NextResponse.json({
    ok: true,
    payments,
    hotels,
    totalsByCurrency,
    sayfa,
    limit,
    totalCount,
    hasMore: sayfa * limit < totalCount,
  });
}

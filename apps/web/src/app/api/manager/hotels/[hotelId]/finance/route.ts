// ---------------------------------------------------------------------------
// GET /api/manager/hotels/[hotelId]/finance — ödeme kayıtları
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { paymentsTable } from "@/lib/db/schema";
import { parsePagination, paginatedQuery } from "@/lib/pagination";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function GET(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  // Finansal veriler yalnızca tesis sahibine (admin dahil) görünür.
  const guard = await requireHotelAccess(hotelId, "owner");
  if (guard.response) return guard.response;

  const pagination = parsePagination(new URL(req.url));
  const db = getDb();
  const where = eq(paymentsTable.hotelId, guard.hotel.id);

  const [result, paidRows] = await Promise.all([
    paginatedQuery({
      db,
      table: paymentsTable,
      where,
      orderBy: desc(paymentsTable.createdAt),
      pagination,
    }),
    db
      .select({ amountMinor: paymentsTable.amountMinor, currency: paymentsTable.currency })
      .from(paymentsTable)
      .where(and(where, eq(paymentsTable.status, "odendi"), sql`${paymentsTable.provider} <> 'stub'`)),
  ]);

  const totalsByCurrency = paidRows.reduce<Record<string, number>>((totals, p) => {
    totals[p.currency] = (totals[p.currency] ?? 0) + p.amountMinor;
    return totals;
  }, {});

  return NextResponse.json({
    ok: true,
    payments: result.items,
    totalsByCurrency,
    sayfa: result.sayfa,
    limit: result.limit,
    totalCount: result.totalCount,
    hasMore: result.hasMore,
  });
}

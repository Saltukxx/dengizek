// ---------------------------------------------------------------------------
// GET /api/manager/hotels/[hotelId]/analytics — son 30 gün özet
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { analyticsEventsTable } from "@/lib/db/schema";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const db = getDb();
  const rows = await db
    .select({
      eventType: analyticsEventsTable.eventType,
      count: sql<number>`count(*)::int`,
    })
    .from(analyticsEventsTable)
    .where(
      and(
        eq(analyticsEventsTable.hotelId, guard.hotel.id),
        gte(analyticsEventsTable.createdAt, since),
      ),
    )
    .groupBy(analyticsEventsTable.eventType);

  const byType = Object.fromEntries(rows.map((r) => [r.eventType, r.count]));
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return NextResponse.json({
    ok: true,
    period: { from: since.toISOString(), to: new Date().toISOString() },
    total,
    byType,
  });
}

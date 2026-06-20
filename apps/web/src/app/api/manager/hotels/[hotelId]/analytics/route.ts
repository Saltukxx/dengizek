// ---------------------------------------------------------------------------
// GET /api/manager/hotels/[hotelId]/analytics — dönem bazlı özet (admin ile uyumlu)
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { analyticsEventsTable, inquiriesTable } from "@/lib/db/schema";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function GET(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const url = new URL(req.url);
  const periodDays = Math.min(90, Math.max(7, Number(url.searchParams.get("period") ?? "30") || 30));

  const since = new Date();
  since.setDate(since.getDate() - periodDays);

  const db = getDb();
  const hotelFilter = eq(analyticsEventsTable.hotelId, guard.hotel.id);

  const [eventRows, inquiryCount, timeSeriesRows] = await Promise.all([
    db
      .select({
        eventType: analyticsEventsTable.eventType,
        count: sql<number>`count(*)::int`,
      })
      .from(analyticsEventsTable)
      .where(and(hotelFilter, gte(analyticsEventsTable.createdAt, since)))
      .groupBy(analyticsEventsTable.eventType),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(inquiriesTable)
      .where(
        and(eq(inquiriesTable.hotelId, guard.hotel.id), gte(inquiriesTable.createdAt, since)),
      ),
    db
      .select({
        day: sql<string>`date_trunc('day', ${analyticsEventsTable.createdAt})::date`,
        count: sql<number>`count(*)::int`,
      })
      .from(analyticsEventsTable)
      .where(and(hotelFilter, gte(analyticsEventsTable.createdAt, since)))
      .groupBy(sql`date_trunc('day', ${analyticsEventsTable.createdAt})::date`)
      .orderBy(sql`date_trunc('day', ${analyticsEventsTable.createdAt})::date`),
  ]);

  const byType = Object.fromEntries(eventRows.map((r) => [r.eventType, r.count]));
  const totalEvents = eventRows.reduce((sum, r) => sum + r.count, 0);
  const tourViews = byType.tour_view ?? 0;
  const inquirySubmits = byType.inquiry_submit ?? 0;
  const conversionRate =
    tourViews > 0 ? Math.round((inquirySubmits / tourViews) * 1000) / 10 : null;

  return NextResponse.json({
    ok: true,
    period: { from: since.toISOString(), to: new Date().toISOString(), days: periodDays },
    totalEvents,
    total: totalEvents,
    byType,
    inquiries: inquiryCount[0]?.count ?? 0,
    timeSeries: timeSeriesRows.map((r) => ({ day: String(r.day), count: r.count })),
    conversionRate,
  });
}

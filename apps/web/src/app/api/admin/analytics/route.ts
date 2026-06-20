// ---------------------------------------------------------------------------
// GET /api/admin/analytics — platform analitiği (filtreli)
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { analyticsEventsTable, hotelsTable, inquiriesTable } from "@/lib/db/schema";

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const url = new URL(req.url);
  const hotelId = url.searchParams.get("hotelId");
  const periodDays = Math.min(90, Math.max(7, Number(url.searchParams.get("period") ?? "30") || 30));

  const since = new Date();
  since.setDate(since.getDate() - periodDays);

  const db = getDb();
  const eventFilters = [gte(analyticsEventsTable.createdAt, since)];
  if (hotelId) eventFilters.push(eq(analyticsEventsTable.hotelId, hotelId));

  const inquiryFilters = [gte(inquiriesTable.createdAt, since)];
  if (hotelId) inquiryFilters.push(eq(inquiriesTable.hotelId, hotelId));

  const [eventRows, inquiryCount, byHotelRows, timeSeriesRows] = await Promise.all([
    db
      .select({
        eventType: analyticsEventsTable.eventType,
        count: sql<number>`count(*)::int`,
      })
      .from(analyticsEventsTable)
      .where(and(...eventFilters))
      .groupBy(analyticsEventsTable.eventType),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(inquiriesTable)
      .where(and(...inquiryFilters)),
    hotelId
      ? Promise.resolve([])
      : db
          .select({
            hotelId: analyticsEventsTable.hotelId,
            hotelName: hotelsTable.name,
            count: sql<number>`count(*)::int`,
          })
          .from(analyticsEventsTable)
          .innerJoin(hotelsTable, eq(analyticsEventsTable.hotelId, hotelsTable.id))
          .where(gte(analyticsEventsTable.createdAt, since))
          .groupBy(analyticsEventsTable.hotelId, hotelsTable.name)
          .orderBy(desc(sql`count(*)`))
          .limit(10),
    db
      .select({
        day: sql<string>`date_trunc('day', ${analyticsEventsTable.createdAt})::date`,
        count: sql<number>`count(*)::int`,
      })
      .from(analyticsEventsTable)
      .where(and(...eventFilters))
      .groupBy(sql`date_trunc('day', ${analyticsEventsTable.createdAt})::date`)
      .orderBy(sql`date_trunc('day', ${analyticsEventsTable.createdAt})::date`),
  ]);

  const byType = Object.fromEntries(eventRows.map((r) => [r.eventType, r.count]));
  const totalEvents = eventRows.reduce((sum, r) => sum + r.count, 0);
  const tourViews = byType.tour_view ?? 0;
  const inquirySubmits = byType.inquiry_submit ?? 0;
  const conversionRate =
    tourViews > 0 ? Math.round((inquirySubmits / tourViews) * 1000) / 10 : null;

  const hotels = hotelId
    ? []
    : await db
        .select({ id: hotelsTable.id, name: hotelsTable.name })
        .from(hotelsTable)
        .orderBy(hotelsTable.name);

  return NextResponse.json({
    ok: true,
    period: { from: since.toISOString(), to: new Date().toISOString(), days: periodDays },
    totalEvents,
    byType,
    inquiries: inquiryCount[0]?.count ?? 0,
    byHotel: byHotelRows,
    timeSeries: timeSeriesRows.map((r) => ({ day: String(r.day), count: r.count })),
    conversionRate,
    hotels,
  });
}

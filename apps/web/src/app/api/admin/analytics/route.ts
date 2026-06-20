// ---------------------------------------------------------------------------
// GET /api/admin/analytics — platform geneli son 30 gün
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { gte, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { analyticsEventsTable, inquiriesTable } from "@/lib/db/schema";

export async function GET() {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const db = getDb();
  const [eventRows, inquiryCount] = await Promise.all([
    db
      .select({
        eventType: analyticsEventsTable.eventType,
        count: sql<number>`count(*)::int`,
      })
      .from(analyticsEventsTable)
      .where(gte(analyticsEventsTable.createdAt, since))
      .groupBy(analyticsEventsTable.eventType),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(inquiriesTable)
      .where(gte(inquiriesTable.createdAt, since)),
  ]);

  const byType = Object.fromEntries(eventRows.map((r) => [r.eventType, r.count]));
  const totalEvents = eventRows.reduce((sum, r) => sum + r.count, 0);

  return NextResponse.json({
    ok: true,
    period: { from: since.toISOString(), to: new Date().toISOString() },
    totalEvents,
    byType,
    inquiries: inquiryCount[0]?.count ?? 0,
  });
}

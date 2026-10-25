// ---------------------------------------------------------------------------
// GET /api/admin/search-insights — arama asistanı kayıtları (son 30 gün)
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq, gte } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { analyticsEventsTable } from "@/lib/db/schema";
import { SEARCH_EVENT, summarizeSearches } from "@/lib/ai/search-log";

const PERIOD_DAYS = 30;

export async function GET() {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const since = new Date();
  since.setDate(since.getDate() - PERIOD_DAYS);
  const events = await getDb()
    .select({ payload: analyticsEventsTable.payload, createdAt: analyticsEventsTable.createdAt })
    .from(analyticsEventsTable)
    .where(and(eq(analyticsEventsTable.eventType, SEARCH_EVENT), gte(analyticsEventsTable.createdAt, since)));

  return NextResponse.json({ ok: true, periodDays: PERIOD_DAYS, ...summarizeSearches(events) });
}

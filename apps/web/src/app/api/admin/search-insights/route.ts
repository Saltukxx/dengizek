// ---------------------------------------------------------------------------
// GET /api/admin/search-insights — arama asistanı kayıtları (son 30 gün)
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq, gte, inArray } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { analyticsEventsTable, hotelsTable } from "@/lib/db/schema";
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

  const insights = summarizeSearches(events);
  const slugs = insights.topHotels.map((h) => h.hotelSlug);
  const names = slugs.length
    ? await getDb().select({ slug: hotelsTable.slug, name: hotelsTable.name }).from(hotelsTable).where(inArray(hotelsTable.slug, slugs))
    : [];
  const nameOf = new Map(names.map((n) => [n.slug, n.name]));

  return NextResponse.json({
    ok: true,
    periodDays: PERIOD_DAYS,
    ...insights,
    topHotels: insights.topHotels.map((h) => ({ ...h, hotelName: nameOf.get(h.hotelSlug) ?? h.hotelSlug })),
  });
}

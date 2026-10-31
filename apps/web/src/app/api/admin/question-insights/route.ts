// ---------------------------------------------------------------------------
// GET /api/admin/question-insights?period=30&hotelId=… — rehbere sorulan
// sorular: en çok sorulanlar, otel ve konu dağılımı, cevaplanma oranı.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq, gte, inArray } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { analyticsEventsTable, hotelsTable } from "@/lib/db/schema";
import { QUESTION_EVENT, summarizeQuestions } from "@/lib/ai/question-log";
import { FEEDBACK_EVENT, summarizeFeedback } from "@/lib/ai/feedback";

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const url = new URL(req.url);
  const hotelId = url.searchParams.get("hotelId");
  const periodDays = Math.min(90, Math.max(7, Number(url.searchParams.get("period") ?? "30") || 30));
  const since = new Date();
  since.setDate(since.getDate() - periodDays);

  const db = getDb();
  const filters = [inArray(analyticsEventsTable.eventType, [QUESTION_EVENT, FEEDBACK_EVENT]), gte(analyticsEventsTable.createdAt, since)];
  if (hotelId) filters.push(eq(analyticsEventsTable.hotelId, hotelId));

  const events = await db
    .select({
      eventType: analyticsEventsTable.eventType,
      payload: analyticsEventsTable.payload,
      hotelSlug: analyticsEventsTable.hotelSlug,
      createdAt: analyticsEventsTable.createdAt,
    })
    .from(analyticsEventsTable)
    .where(and(...filters));

  const insights = summarizeQuestions(events.filter((e) => e.eventType === QUESTION_EVENT));
  const feedback = summarizeFeedback(events.filter((e) => e.eventType === FEEDBACK_EVENT));
  const slugs = insights.byHotel.map((h) => h.hotelSlug);
  const names = slugs.length
    ? await db.select({ slug: hotelsTable.slug, name: hotelsTable.name }).from(hotelsTable).where(inArray(hotelsTable.slug, slugs))
    : [];
  const nameOf = new Map(names.map((n) => [n.slug, n.name]));

  return NextResponse.json({
    ok: true,
    periodDays,
    ...insights,
    feedback,
    byHotel: insights.byHotel.map((h) => ({ ...h, hotelName: nameOf.get(h.hotelSlug) ?? h.hotelSlug })),
  });
}

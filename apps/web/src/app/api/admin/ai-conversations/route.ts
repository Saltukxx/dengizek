// ---------------------------------------------------------------------------
// GET /api/admin/ai-conversations — rehbere sorulan her soru ve verilen cevap
// (ne girdi, ne çıktı). Süzgeçler: period, hotelId, outcome, surface, q
// (soru/cevap metninde arama), sayfa. Her satırın ziyaret kimliği yolculuğa
// bağlanır (bkz. /api/admin/visits/[visitId]).
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { analyticsEventsTable, hotelsTable } from "@/lib/db/schema";
import { QUESTION_EVENT, questionSurface } from "@/lib/ai/question-log";
import { HOTEL_PAGE_TOUR_ID } from "@/lib/ai/hotel-page-chat";
import { periodFromUrl } from "@/lib/journey-data";

const PAGE_SIZE = 25;

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const url = new URL(req.url);
  const { since } = periodFromUrl(url);
  const hotelId = url.searchParams.get("hotelId");
  const outcome = url.searchParams.get("outcome");
  const surface = url.searchParams.get("surface");
  const q = url.searchParams.get("q")?.trim().slice(0, 100);
  const page = Math.max(1, Number(url.searchParams.get("sayfa") ?? "1") || 1);

  const e = analyticsEventsTable;
  const filters = [eq(e.eventType, QUESTION_EVENT), gte(e.createdAt, since)];
  if (hotelId) filters.push(eq(e.hotelId, hotelId));
  if (outcome) filters.push(sql`${e.payload} ->> 'outcome' = ${outcome}`);
  // surface alanından önceki kayıtlarda yüzey tur kimliğinden anlaşılır (bkz. questionSurface).
  const surfaceExpr = sql`coalesce(${e.payload} ->> 'surface', case when ${e.payload} ->> 'tourId' = ${HOTEL_PAGE_TOUR_ID} then 'otel-sayfasi' else 'tur' end)`;
  if (surface === "otel-sayfasi" || surface === "tur") filters.push(sql`${surfaceExpr} = ${surface}`);
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    filters.push(sql`(${e.payload} ->> 'question' ilike ${like} or ${e.payload} ->> 'answer' ilike ${like})`);
  }
  const where = and(...filters);

  const db = getDb();
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: e.id,
        createdAt: e.createdAt,
        visitId: e.visitId,
        hotelSlug: e.hotelSlug,
        hotelName: hotelsTable.name,
        payload: e.payload,
      })
      .from(e)
      .leftJoin(hotelsTable, eq(hotelsTable.id, e.hotelId))
      .where(where)
      .orderBy(desc(e.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(e).where(where),
  ]);

  return NextResponse.json({
    ok: true,
    page,
    pageSize: PAGE_SIZE,
    total: Number(total),
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      visitId: r.visitId,
      hotelSlug: r.hotelSlug,
      hotelName: r.hotelName ?? r.hotelSlug,
      question: (r.payload.question as string | undefined) ?? null,
      answer: (r.payload.answer as string | undefined) ?? null,
      topic: r.payload.topic ?? null,
      outcome: r.payload.outcome ?? null,
      source: r.payload.source ?? null,
      surface: questionSurface(r.payload),
      stepId: r.payload.stepId ?? null,
      tourId: r.payload.tourId ?? null,
      tools: r.payload.tools ?? [],
      latencyMs: r.payload.latencyMs ?? null,
      model: r.payload.model ?? null,
      inputTokens: r.payload.inputTokens ?? null,
      outputTokens: r.payload.outputTokens ?? null,
      textPruned: r.payload.metinSilindi === true,
    })),
  });
}

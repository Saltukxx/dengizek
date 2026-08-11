// ---------------------------------------------------------------------------
// POST /api/manager/hotels/[hotelId]/tours/[tourId]/steps/reorder
// Adım sıralaması — neon-http transaction desteklemediği için TEK SQL
// ifadesiyle (unnest join) atomik olarak güncellenir.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { tourStepsTable, toursTable } from "@/lib/db/schema";
import { stepsReorderSchema } from "@/lib/schemas/tour-editor";
import { withTransaction } from "@/lib/db/transaction";
import { revisionConflictResponse } from "@/lib/panel-revision";

type RouteParams = { params: Promise<{ hotelId: string; tourId: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  const { hotelId, tourId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = stepsReorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const sirali = parsed.data.sirali;
  if (new Set(sirali).size !== sirali.length) {
    return NextResponse.json(
      { ok: false, error: "Sıralama listesinde tekrar eden adım var." },
      { status: 400 },
    );
  }

  const db = getDb();

  // Mevcut adım kümesi sıralama listesiyle birebir eşleşmeli
  const existing = await db
    .select({ stepId: tourStepsTable.stepId })
    .from(tourStepsTable)
    .where(
      and(
        eq(tourStepsTable.hotelSlug, guard.hotel.slug),
        eq(tourStepsTable.tourId, tourId),
      ),
    );
  const existingIds = new Set(existing.map((r) => r.stepId));
  if (
    existingIds.size !== sirali.length ||
    sirali.some((id) => !existingIds.has(id))
  ) {
    return NextResponse.json(
      { ok: false, error: "Sıralama listesi mevcut adımlarla eşleşmiyor." },
      { status: 400 },
    );
  }

  // Tek atomik UPDATE — unnest WITH ORDINALITY ile sıra indeksleri.
  // Dizi parametresi jsonb olarak bağlanır (drizzle JS dizisini tuple'a
  // çevirdiği için doğrudan ::text[] cast edilemez).
  const reordered = await withTransaction(async (tx) => {
    const [tour] = await tx.select({ id: toursTable.id }).from(toursTable).where(and(
      eq(toursTable.hotelId, guard.hotel.id),
      eq(toursTable.tourId, tourId),
      eq(toursTable.draftRevision, parsed.data.expectedRevision),
    )).for("update");
    if (!tour) return false;
    await tx.execute(sql`
    UPDATE tour_steps AS ts
    SET order_index = v.ord - 1
    FROM unnest(
      ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(sirali)}::jsonb))
    ) WITH ORDINALITY AS v(step_id, ord)
    WHERE ts.hotel_slug = ${guard.hotel.slug}
      AND ts.tour_id = ${tourId}
      AND ts.step_id = v.step_id
    `);
    await tx.update(toursTable).set({ draftRevision: sql`${toursTable.draftRevision} + 1`, updatedAt: new Date() }).where(eq(toursTable.id, tour.id));
    return true;
  });
  if (!reordered) {
    const [latest] = await db.select({ draftRevision: toursTable.draftRevision, updatedAt: toursTable.updatedAt })
      .from(toursTable).where(and(eq(toursTable.hotelId, guard.hotel.id), eq(toursTable.tourId, tourId))).limit(1);
    return revisionConflictResponse(latest?.draftRevision, latest?.updatedAt);
  }

  return NextResponse.json({ ok: true, draftRevision: parsed.data.expectedRevision + 1 });
}

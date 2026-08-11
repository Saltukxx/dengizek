// ---------------------------------------------------------------------------
// GET/POST/PATCH/DELETE /api/manager/hotels/[hotelId]/promotions
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { promotionsTable } from "@/lib/db/schema";
import { promotionPatchSchema, promotionSchema } from "@/lib/schemas/hotel-panel";
import { logAudit } from "@/lib/audit";
import { assertRoomsBelongToHotel } from "@/lib/tenant-integrity";
import { abortPanelMutation, expectedRevisionRequiredResponse, getPanelRevision, panelRevisionConflictResponse, readExpectedRevision, runPanelMutation } from "@/lib/panel-revision";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const db = getDb();
  const promotions = await db
    .select()
    .from(promotionsTable)
    .where(eq(promotionsTable.hotelId, guard.hotel.id))
    .orderBy(asc(promotionsTable.createdAt));

  const revision = await getPanelRevision(db, guard.hotel.id, "promotions");
  return NextResponse.json({ ok: true, promotions, revision: revision.revision });
}

export async function POST(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const expectedRevision = readExpectedRevision(body);
  if (!expectedRevision) return expectedRevisionRequiredResponse();
  const parsed = promotionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (!(await assertRoomsBelongToHotel(guard.hotel.id, parsed.data.roomIds))) {
    return NextResponse.json({ ok: false, error: "Oda bulunamadı." }, { status: 404 });
  }

  let promotion: typeof promotionsTable.$inferSelect;
  let revision: number;
  try {
    const mutation = await runPanelMutation({
      hotelId: guard.hotel.id, scope: "promotions", expectedRevision, updatedBy: guard.user.id,
      mutate: async (tx) => { const [row] = await tx.insert(promotionsTable)
        .values({ ...parsed.data, hotelId: guard.hotel.id }).returning(); return row; },
    });
    promotion = mutation.result; revision = mutation.revision;
  } catch (error) { const conflict = panelRevisionConflictResponse(error); if (conflict) return conflict; throw error; }

  await logAudit({
    actor: guard.user,
    action: "kampanya.olusturuldu",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { promotionId: promotion.id, name: promotion.name },
  });

  return NextResponse.json({ ok: true, promotion, revision }, { status: 201 });
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const expectedRevision = readExpectedRevision(body);
  if (!expectedRevision) return expectedRevisionRequiredResponse();
  const parsed = promotionPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (parsed.data.roomIds && !(await assertRoomsBelongToHotel(guard.hotel.id, parsed.data.roomIds))) {
    return NextResponse.json({ ok: false, error: "Oda bulunamadı." }, { status: 404 });
  }

  const { id, ...fields } = parsed.data;
  let updated: typeof promotionsTable.$inferSelect | undefined;
  let revision: number;
  try {
    const mutation = await runPanelMutation({
      hotelId: guard.hotel.id, scope: "promotions", expectedRevision, updatedBy: guard.user.id,
      mutate: async (tx) => { const [row] = await tx.update(promotionsTable).set(fields).where(and(
        eq(promotionsTable.id, id), eq(promotionsTable.hotelId, guard.hotel.id),
      )).returning(); if (!row) abortPanelMutation("Kampanya bulunamadı."); return row; },
    });
    updated = mutation.result; revision = mutation.revision;
  } catch (error) { const conflict = panelRevisionConflictResponse(error); if (conflict) return conflict; throw error; }

  if (!updated) {
    return NextResponse.json({ ok: false, error: "Kampanya bulunamadı." }, { status: 404 });
  }
  await logAudit({
    actor: guard.user,
    action: "kampanya.guncellendi",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { promotionId: updated.id },
  });
  return NextResponse.json({ ok: true, promotion: updated, revision });
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const expectedRevision = readExpectedRevision(body);
  if (!expectedRevision) return expectedRevisionRequiredResponse();
  const id = body?.id as string | undefined;
  if (!id) {
    return NextResponse.json({ ok: false, error: "id gerekli." }, { status: 400 });
  }

  let revision: number;
  try {
    const mutation = await runPanelMutation({
      hotelId: guard.hotel.id, scope: "promotions", expectedRevision, updatedBy: guard.user.id,
      mutate: async (tx) => { await tx.delete(promotionsTable).where(and(
        eq(promotionsTable.id, id), eq(promotionsTable.hotelId, guard.hotel.id),
      )); },
    });
    revision = mutation.revision;
  } catch (error) { const conflict = panelRevisionConflictResponse(error); if (conflict) return conflict; throw error; }

  await logAudit({
    actor: guard.user,
    action: "kampanya.silindi",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { promotionId: id },
  });

  return NextResponse.json({ ok: true, revision });
}

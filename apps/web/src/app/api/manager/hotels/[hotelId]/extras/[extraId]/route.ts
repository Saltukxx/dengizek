// ---------------------------------------------------------------------------
// PATCH/DELETE /api/manager/hotels/[hotelId]/extras/[extraId]
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { extrasTable } from "@/lib/db/schema";
import { extraUpsertSchema } from "@/lib/schemas/hotel-content";
import { logAudit } from "@/lib/audit";
import { expectedRevisionRequiredResponse, panelRevisionConflictResponse, readExpectedRevision, runPanelMutation } from "@/lib/panel-revision";

type RouteParams = { params: Promise<{ hotelId: string; extraId: string }> };

async function findExtra(hotelId: string, extraId: string) {
  const db = getDb();
  const [extra] = await db
    .select()
    .from(extrasTable)
    .where(and(eq(extrasTable.hotelId, hotelId), eq(extrasTable.id, extraId)))
    .limit(1);
  return extra;
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { hotelId, extraId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const expectedRevision = readExpectedRevision(body);
  if (!expectedRevision) return expectedRevisionRequiredResponse();
  const parsed = extraUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const extra = await findExtra(guard.hotel.id, extraId);
  if (!extra) {
    return NextResponse.json({ ok: false, error: "Hizmet bulunamadı." }, { status: 404 });
  }

  try {
    const { result: updated, revision } = await runPanelMutation({
      hotelId: guard.hotel.id, scope: "extras", expectedRevision, updatedBy: guard.user.id,
      mutate: async (tx) => {
        const [row] = await tx.update(extrasTable).set({
          ...parsed.data, imageUrl: parsed.data.imageUrl || null, updatedAt: new Date(),
        }).where(eq(extrasTable.id, extra.id)).returning();
        return row;
      },
    });
    return NextResponse.json({ ok: true, extra: updated, revision });
  } catch (error) {
    const conflict = panelRevisionConflictResponse(error);
    if (conflict) return conflict;
    throw error;
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const { hotelId, extraId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;
  const body = await req.json().catch(() => null);
  const expectedRevision = readExpectedRevision(body);
  if (!expectedRevision) return expectedRevisionRequiredResponse();

  const extra = await findExtra(guard.hotel.id, extraId);
  if (!extra) {
    return NextResponse.json({ ok: false, error: "Hizmet bulunamadı." }, { status: 404 });
  }

  try {
    const { revision } = await runPanelMutation({
      hotelId: guard.hotel.id, scope: "extras", expectedRevision, updatedBy: guard.user.id,
      mutate: async (tx) => { await tx.delete(extrasTable).where(eq(extrasTable.id, extra.id)); },
    });
    await logAudit({
    actor: guard.user,
    action: "ekstra.silindi",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { name: extra.name },
  });

    return NextResponse.json({ ok: true, revision });
  } catch (error) {
    const conflict = panelRevisionConflictResponse(error);
    if (conflict) return conflict;
    throw error;
  }
}

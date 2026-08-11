// ---------------------------------------------------------------------------
// GET/POST/PATCH/DELETE /api/manager/hotels/[hotelId]/availability-notes
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { hotelAvailabilityNotesTable } from "@/lib/db/schema";
import { availabilityNotePatchSchema, availabilityNoteSchema } from "@/lib/schemas/hotel-panel";
import { logAudit } from "@/lib/audit";
import { abortPanelMutation, expectedRevisionRequiredResponse, getPanelRevision, panelRevisionConflictResponse, readExpectedRevision, runPanelMutation } from "@/lib/panel-revision";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const db = getDb();
  const notes = await db
    .select()
    .from(hotelAvailabilityNotesTable)
    .where(eq(hotelAvailabilityNotesTable.hotelId, guard.hotel.id))
    .orderBy(asc(hotelAvailabilityNotesTable.startDate));

  const revision = await getPanelRevision(db, guard.hotel.id, "availability");
  return NextResponse.json({ ok: true, notes, revision: revision.revision });
}

export async function POST(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const expectedRevision = readExpectedRevision(body);
  if (!expectedRevision) return expectedRevisionRequiredResponse();
  const parsed = availabilityNoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let note: typeof hotelAvailabilityNotesTable.$inferSelect;
  let revision: number;
  try {
    const mutation = await runPanelMutation({
      hotelId: guard.hotel.id, scope: "availability", expectedRevision, updatedBy: guard.user.id,
      mutate: async (tx) => {
        const [row] = await tx.insert(hotelAvailabilityNotesTable).values({
          hotelId: guard.hotel.id, label: parsed.data.label,
          startDate: parsed.data.startDate ?? null, endDate: parsed.data.endDate ?? null,
          isBlackout: parsed.data.isBlackout,
        }).returning();
        return row;
      },
    });
    note = mutation.result; revision = mutation.revision;
  } catch (error) {
    const conflict = panelRevisionConflictResponse(error); if (conflict) return conflict; throw error;
  }

  await logAudit({
    actor: guard.user,
    action: "musaitlik_notu.olusturuldu",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { noteId: note.id },
  });

  return NextResponse.json({ ok: true, note, revision }, { status: 201 });
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const expectedRevision = readExpectedRevision(body);
  if (!expectedRevision) return expectedRevisionRequiredResponse();
  const parsed = availabilityNotePatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id, ...fields } = parsed.data;
  let updated: typeof hotelAvailabilityNotesTable.$inferSelect | undefined;
  let revision: number;
  try {
    const mutation = await runPanelMutation({
      hotelId: guard.hotel.id, scope: "availability", expectedRevision, updatedBy: guard.user.id,
      mutate: async (tx) => {
        const [row] = await tx.update(hotelAvailabilityNotesTable).set(fields).where(and(
          eq(hotelAvailabilityNotesTable.id, id), eq(hotelAvailabilityNotesTable.hotelId, guard.hotel.id),
        )).returning();
        if (!row) abortPanelMutation("Not bulunamadı.");
        return row;
      },
    });
    updated = mutation.result; revision = mutation.revision;
  } catch (error) { const conflict = panelRevisionConflictResponse(error); if (conflict) return conflict; throw error; }

  if (!updated) {
    return NextResponse.json({ ok: false, error: "Not bulunamadı." }, { status: 404 });
  }
  await logAudit({
    actor: guard.user,
    action: "musaitlik_notu.guncellendi",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { noteId: updated.id },
  });
  return NextResponse.json({ ok: true, note: updated, revision });
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
      hotelId: guard.hotel.id, scope: "availability", expectedRevision, updatedBy: guard.user.id,
      mutate: async (tx) => { await tx.delete(hotelAvailabilityNotesTable).where(and(
        eq(hotelAvailabilityNotesTable.id, id), eq(hotelAvailabilityNotesTable.hotelId, guard.hotel.id),
      )); },
    });
    revision = mutation.revision;
  } catch (error) { const conflict = panelRevisionConflictResponse(error); if (conflict) return conflict; throw error; }

  await logAudit({
    actor: guard.user,
    action: "musaitlik_notu.silindi",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { noteId: id },
  });

  return NextResponse.json({ ok: true, revision });
}

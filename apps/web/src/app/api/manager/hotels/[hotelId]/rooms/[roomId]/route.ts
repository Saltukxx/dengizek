// ---------------------------------------------------------------------------
// PATCH/DELETE /api/manager/hotels/[hotelId]/rooms/[roomId]
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq, gte, inArray } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { bookingsTable, roomsTable } from "@/lib/db/schema";
import { roomUpsertSchema } from "@/lib/schemas/hotel-content";
import { logAudit } from "@/lib/audit";
import { syncSystemInventoryCapacity } from "@/lib/inventory-seed";
import { todayIso } from "@/lib/price";
import {
  abortPanelMutation,
  expectedRevisionRequiredResponse,
  panelRevisionConflictResponse,
  readExpectedRevision,
  runPanelMutation,
} from "@/lib/panel-revision";

type RouteParams = { params: Promise<{ hotelId: string; roomId: string }> };

async function findRoom(hotelId: string, roomId: string) {
  const db = getDb();
  const [room] = await db
    .select()
    .from(roomsTable)
    .where(and(eq(roomsTable.hotelId, hotelId), eq(roomsTable.id, roomId)))
    .limit(1);
  return room;
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { hotelId, roomId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const expectedRevision = readExpectedRevision(body);
  if (!expectedRevision) return expectedRevisionRequiredResponse();
  const parsed = roomUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const room = await findRoom(guard.hotel.id, roomId);
  if (!room) {
    return NextResponse.json({ ok: false, error: "Oda bulunamadı." }, { status: 404 });
  }

  try {
    const { result: updated, revision } = await runPanelMutation({
      hotelId: guard.hotel.id,
      scope: "rooms",
      expectedRevision,
      updatedBy: guard.user.id,
      mutate: async (tx) => {
        const [row] = await tx.update(roomsTable)
          .set({
            ...parsed.data,
            imageUrl: parsed.data.imageUrl || null,
            updatedAt: new Date(),
          })
          .where(eq(roomsTable.id, room.id))
          .returning();
        if (row.unitCount !== room.unitCount) {
          await syncSystemInventoryCapacity(tx, guard.hotel.id, room.id, room.unitCount, row.unitCount);
        }
        return row;
      },
    });
    return NextResponse.json({ ok: true, room: updated, revision });
  } catch (err) {
    const conflict = panelRevisionConflictResponse(err);
    if (conflict) return conflict;
    const msg = err instanceof Error ? err.message : "";
    if (/unique|duplicate/i.test(msg)) {
      return NextResponse.json(
        { ok: false, error: "Bu oda kimliği zaten kullanılıyor." },
        { status: 409 },
      );
    }
    throw err;
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const { hotelId, roomId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const expectedRevision = readExpectedRevision(body);
  if (!expectedRevision) return expectedRevisionRequiredResponse();

  const room = await findRoom(guard.hotel.id, roomId);
  if (!room) {
    return NextResponse.json({ ok: false, error: "Oda bulunamadı." }, { status: 404 });
  }

  try {
    const { revision } = await runPanelMutation({
      hotelId: guard.hotel.id,
      scope: "rooms",
      expectedRevision,
      updatedBy: guard.user.id,
      mutate: async (tx) => {
        // Oda silinince rezervasyonun oda bağı kopar (room_id → NULL) ve
        // envanteri silinir; süren rezervasyon odasız kalmasın.
        const [active] = await tx
          .select({ id: bookingsTable.id })
          .from(bookingsTable)
          .where(and(
            eq(bookingsTable.roomId, room.id),
            inArray(bookingsTable.status, ["beklemede", "onaylandi"]),
            gte(bookingsTable.checkOut, todayIso()),
          ))
          .limit(1);
        if (active) {
          abortPanelMutation(
            "Bu odanın bekleyen veya onaylı rezervasyonu var — önce rezervasyonları kapatın.",
            409,
          );
        }
        await tx.delete(roomsTable).where(eq(roomsTable.id, room.id));
      },
    });

    await logAudit({
      actor: guard.user,
      action: "oda.silindi",
      entityType: "hotel",
      entityId: guard.hotel.id,
      meta: { roomSlug: room.slug, name: room.name },
    });

    return NextResponse.json({ ok: true, revision });
  } catch (err) {
    const conflict = panelRevisionConflictResponse(err);
    if (conflict) return conflict;
    throw err;
  }
}

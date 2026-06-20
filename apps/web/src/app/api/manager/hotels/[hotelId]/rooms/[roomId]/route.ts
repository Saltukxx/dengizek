// ---------------------------------------------------------------------------
// PATCH/DELETE /api/manager/hotels/[hotelId]/rooms/[roomId]
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { roomsTable } from "@/lib/db/schema";
import { roomUpsertSchema } from "@/lib/schemas/hotel-content";
import { logAudit } from "@/lib/audit";

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

  const db = getDb();
  try {
    const [updated] = await db
      .update(roomsTable)
      .set({
        ...parsed.data,
        imageUrl: parsed.data.imageUrl || null,
        updatedAt: new Date(),
      })
      .where(eq(roomsTable.id, room.id))
      .returning();
    return NextResponse.json({ ok: true, room: updated });
  } catch (err) {
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

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { hotelId, roomId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const room = await findRoom(guard.hotel.id, roomId);
  if (!room) {
    return NextResponse.json({ ok: false, error: "Oda bulunamadı." }, { status: 404 });
  }

  const db = getDb();
  await db.delete(roomsTable).where(eq(roomsTable.id, room.id));

  await logAudit({
    actor: guard.user,
    action: "oda.silindi",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { roomSlug: room.slug, name: room.name },
  });

  return NextResponse.json({ ok: true });
}

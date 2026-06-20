// ---------------------------------------------------------------------------
// GET/POST /api/manager/hotels/[hotelId]/rooms — oda listesi / yeni oda
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { roomRatesTable, roomsTable } from "@/lib/db/schema";
import { roomUpsertSchema } from "@/lib/schemas/hotel-content";
import { logAudit } from "@/lib/audit";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const db = getDb();
  const rooms = await db
    .select()
    .from(roomsTable)
    .where(eq(roomsTable.hotelId, guard.hotel.id))
    .orderBy(asc(roomsTable.orderIndex), asc(roomsTable.createdAt));

  // Dönemsel fiyatlar tek sorguyla çekilip odalara dağıtılır
  const allRates = await db
    .select()
    .from(roomRatesTable)
    .where(eq(roomRatesTable.hotelId, guard.hotel.id))
    .orderBy(asc(roomRatesTable.startDate));
  const ratesByRoom = new Map<string, typeof allRates>();
  for (const rate of allRates) {
    const list = ratesByRoom.get(rate.roomId) ?? [];
    list.push(rate);
    ratesByRoom.set(rate.roomId, list);
  }

  return NextResponse.json({
    ok: true,
    rooms: rooms.map((r) => ({ ...r, rates: ratesByRoom.get(r.id) ?? [] })),
  });
}

export async function POST(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
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

  const db = getDb();

  // Yeni oda listenin sonuna eklenir
  const existing = await db
    .select({ orderIndex: roomsTable.orderIndex })
    .from(roomsTable)
    .where(eq(roomsTable.hotelId, guard.hotel.id));
  const nextOrder = existing.reduce((max, r) => Math.max(max, r.orderIndex + 1), 0);

  try {
    const [room] = await db
      .insert(roomsTable)
      .values({
        ...parsed.data,
        imageUrl: parsed.data.imageUrl || null,
        hotelId: guard.hotel.id,
        orderIndex: nextOrder,
      })
      .returning();

    await logAudit({
      actor: guard.user,
      action: "oda.olusturuldu",
      entityType: "hotel",
      entityId: guard.hotel.id,
      meta: { roomSlug: room.slug, name: room.name },
    });

    return NextResponse.json({ ok: true, room }, { status: 201 });
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

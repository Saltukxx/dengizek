// ---------------------------------------------------------------------------
// GET/PUT /api/manager/hotels/[hotelId]/rooms/[roomId]/rates
// Dönemsel fiyatlar — PUT tüm listeyi senkronize eder:
// id'li kayıtlar güncellenir, id'sizler eklenir, listede olmayanlar silinir.
// (neon-http transactionsız — kısa tutarsızlık penceresi kabul edilir.)
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { roomRatesTable, roomsTable } from "@/lib/db/schema";
import { roomRatesPutSchema } from "@/lib/schemas/hotel-content";
import { logAudit } from "@/lib/audit";

type RouteParams = { params: Promise<{ hotelId: string; roomId: string }> };

async function findRoom(hotelId: string, roomId: string) {
  const db = getDb();
  const [room] = await db
    .select({ id: roomsTable.id, slug: roomsTable.slug })
    .from(roomsTable)
    .where(and(eq(roomsTable.hotelId, hotelId), eq(roomsTable.id, roomId)))
    .limit(1);
  return room;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { hotelId, roomId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const room = await findRoom(guard.hotel.id, roomId);
  if (!room) {
    return NextResponse.json({ ok: false, error: "Oda bulunamadı." }, { status: 404 });
  }

  const db = getDb();
  const rates = await db
    .select()
    .from(roomRatesTable)
    .where(eq(roomRatesTable.roomId, room.id))
    .orderBy(asc(roomRatesTable.startDate));
  return NextResponse.json({ ok: true, rates });
}

export async function PUT(req: Request, { params }: RouteParams) {
  const { hotelId, roomId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = roomRatesPutSchema.safeParse(body);
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
  const incoming = parsed.data.donemler;
  const existing = await db
    .select({ id: roomRatesTable.id })
    .from(roomRatesTable)
    .where(eq(roomRatesTable.roomId, room.id));
  const existingIds = new Set(existing.map((r) => r.id));

  // Gönderilen id'lerden bu odaya ait olmayanlar reddedilir (tenant güvenliği)
  const foreignIds = incoming.filter((r) => r.id && !existingIds.has(r.id));
  if (foreignIds.length > 0) {
    return NextResponse.json(
      { ok: false, error: "Geçersiz dönem kimliği." },
      { status: 400 },
    );
  }

  const keptIds = new Set(incoming.filter((r) => r.id).map((r) => r.id as string));
  const toDelete = [...existingIds].filter((id) => !keptIds.has(id));

  if (toDelete.length > 0) {
    await db.delete(roomRatesTable).where(inArray(roomRatesTable.id, toDelete));
  }
  for (const rate of incoming) {
    const values = {
      name: rate.name,
      startDate: rate.startDate,
      endDate: rate.endDate,
      priceMinor: rate.priceMinor,
      currency: rate.currency,
      minStayNights: rate.minStayNights ?? null,
    };
    if (rate.id) {
      await db
        .update(roomRatesTable)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(roomRatesTable.id, rate.id));
    } else {
      await db
        .insert(roomRatesTable)
        .values({ ...values, roomId: room.id, hotelId: guard.hotel.id });
    }
  }

  await logAudit({
    actor: guard.user,
    action: "oda.donemfiyat.guncellendi",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { roomSlug: room.slug, donemSayisi: incoming.length, silinen: toDelete.length },
  });

  const rates = await db
    .select()
    .from(roomRatesTable)
    .where(eq(roomRatesTable.roomId, room.id))
    .orderBy(asc(roomRatesTable.startDate));
  return NextResponse.json({ ok: true, rates });
}

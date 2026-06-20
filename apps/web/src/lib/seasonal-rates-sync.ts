// ---------------------------------------------------------------------------
// Dönemsel oda fiyatları — oda başına tam liste senkronizasyonu
// ---------------------------------------------------------------------------

import { and, asc, eq, inArray } from "drizzle-orm";
import type { getDb } from "@/lib/db";
import { roomRatesTable, roomsTable } from "@/lib/db/schema";
import type { RoomRateValues } from "@/lib/schemas/hotel-content";

type Db = ReturnType<typeof getDb>;

export async function syncRoomRates(
  db: Db,
  hotelId: string,
  roomId: string,
  incoming: RoomRateValues[],
) {
  const existing = await db
    .select({ id: roomRatesTable.id })
    .from(roomRatesTable)
    .where(eq(roomRatesTable.roomId, roomId));
  const existingIds = new Set(existing.map((r) => r.id));

  const foreignIds = incoming.filter((r) => r.id && !existingIds.has(r.id));
  if (foreignIds.length > 0) {
    return { ok: false as const, error: "Geçersiz dönem kimliği." };
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
      occupancyPrices: rate.occupancyPrices ?? [],
    };
    if (rate.id) {
      await db
        .update(roomRatesTable)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(roomRatesTable.id, rate.id));
    } else {
      await db.insert(roomRatesTable).values({ ...values, roomId, hotelId });
    }
  }

  const rates = await db
    .select()
    .from(roomRatesTable)
    .where(eq(roomRatesTable.roomId, roomId))
    .orderBy(asc(roomRatesTable.startDate));

  return { ok: true as const, rates, deleted: toDelete.length };
}

export async function findHotelRoom(db: Db, hotelId: string, roomId: string) {
  const [room] = await db
    .select({ id: roomsTable.id, slug: roomsTable.slug })
    .from(roomsTable)
    .where(and(eq(roomsTable.hotelId, hotelId), eq(roomsTable.id, roomId)))
    .limit(1);
  return room ?? null;
}

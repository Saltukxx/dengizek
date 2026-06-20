import { and, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { bookingsTable, roomInventoryTable } from "@/lib/db/schema";
import { eachStayNight, stayRangesOverlap } from "@/lib/stay-dates";

const ACTIVE_STATUSES = ["beklemede", "onaylandi"] as const;

export async function findOverlappingBooking(
  db: Db,
  hotelId: string,
  roomId: string | null | undefined,
  checkIn: string,
  checkOut: string,
  excludeBookingId?: string,
) {
  const existing = await db
    .select({
      id: bookingsTable.id,
      checkIn: bookingsTable.checkIn,
      checkOut: bookingsTable.checkOut,
      roomId: bookingsTable.roomId,
      status: bookingsTable.status,
    })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.hotelId, hotelId),
        inArray(bookingsTable.status, [...ACTIVE_STATUSES]),
        excludeBookingId ? ne(bookingsTable.id, excludeBookingId) : undefined,
        roomId ? eq(bookingsTable.roomId, roomId) : undefined,
      ),
    );

  return existing.find((b) =>
    stayRangesOverlap(checkIn, checkOut, String(b.checkIn), String(b.checkOut)),
  );
}

/** Onayda envanter düş; iptalde geri ekle */
export async function adjustInventoryForBooking(
  db: Db,
  hotelId: string,
  roomId: string | null | undefined,
  checkIn: string,
  checkOut: string,
  delta: -1 | 1,
) {
  if (!roomId) return;

  const nights = eachStayNight(checkIn, checkOut);
  for (const date of nights) {
    const [row] = await db
      .select()
      .from(roomInventoryTable)
      .where(and(eq(roomInventoryTable.roomId, roomId), eq(roomInventoryTable.date, date)))
      .limit(1);

    if (row) {
      const next = Math.max(0, row.allotment + delta);
      await db
        .update(roomInventoryTable)
        .set({ allotment: next })
        .where(eq(roomInventoryTable.id, row.id));
    } else if (delta < 0) {
      await db.insert(roomInventoryTable).values({
        hotelId,
        roomId,
        date,
        allotment: 0,
        stopSell: false,
      });
    }
  }
}

export async function assertInventoryAvailable(
  db: Db,
  roomId: string | null | undefined,
  checkIn: string,
  checkOut: string,
) {
  if (!roomId) return { ok: true as const };

  const nights = eachStayNight(checkIn, checkOut);
  for (const date of nights) {
    const [row] = await db
      .select()
      .from(roomInventoryTable)
      .where(and(eq(roomInventoryTable.roomId, roomId), eq(roomInventoryTable.date, date)))
      .limit(1);

    if (row?.stopSell) {
      return { ok: false as const, error: `${date} tarihinde satış kapalı.` };
    }
    if (row && row.allotment <= 0) {
      return { ok: false as const, error: `${date} tarihinde müsait oda yok.` };
    }
  }
  return { ok: true as const };
}

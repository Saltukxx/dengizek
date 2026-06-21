import { and, eq, gt, inArray, ne, sql } from "drizzle-orm";
import type { Db, Tx } from "@/lib/db";
import { withTransaction } from "@/lib/db/transaction";
import { bookingsTable, roomInventoryTable } from "@/lib/db/schema";
import { eachStayNight, stayRangesOverlap } from "@/lib/stay-dates";

const ACTIVE_STATUSES = ["beklemede", "onaylandi"] as const;

export type BookingErrorCode = "not_found" | "overlap" | "inventory" | "invalid_state";

export class BookingServiceError extends Error {
  constructor(
    message: string,
    public code: BookingErrorCode,
  ) {
    super(message);
  }
}

type DbLike = Db | Tx;

export async function findOverlappingBooking(
  db: DbLike,
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

async function assertInventoryAvailableTx(
  db: DbLike,
  roomId: string | null | undefined,
  checkIn: string,
  checkOut: string,
) {
  if (!roomId) return;

  const nights = eachStayNight(checkIn, checkOut);
  for (const date of nights) {
    const [row] = await db
      .select()
      .from(roomInventoryTable)
      .where(and(eq(roomInventoryTable.roomId, roomId), eq(roomInventoryTable.date, date)))
      .limit(1);

    if (!row) {
      throw new BookingServiceError(`${date} tarihinde envanter kaydı yok.`, "inventory");
    }
    if (row.stopSell) {
      throw new BookingServiceError(`${date} tarihinde satış kapalı.`, "inventory");
    }
    if (row.allotment <= 0) {
      throw new BookingServiceError(`${date} tarihinde müsait oda yok.`, "inventory");
    }
  }
}

async function deductInventoryTx(
  db: DbLike,
  hotelId: string,
  roomId: string,
  checkIn: string,
  checkOut: string,
) {
  const nights = eachStayNight(checkIn, checkOut);
  for (const date of nights) {
    const updated = await db
      .update(roomInventoryTable)
      .set({ allotment: sql`${roomInventoryTable.allotment} - 1` })
      .where(
        and(
          eq(roomInventoryTable.roomId, roomId),
          eq(roomInventoryTable.date, date),
          eq(roomInventoryTable.stopSell, false),
          gt(roomInventoryTable.allotment, 0),
        ),
      )
      .returning();

    if (updated.length === 0) {
      const [row] = await db
        .select({ allotment: roomInventoryTable.allotment, stopSell: roomInventoryTable.stopSell })
        .from(roomInventoryTable)
        .where(and(eq(roomInventoryTable.roomId, roomId), eq(roomInventoryTable.date, date)))
        .limit(1);

      if (!row) {
        throw new BookingServiceError(`${date} tarihinde envanter kaydı yok.`, "inventory");
      }
      if (row.stopSell || row.allotment <= 0) {
        throw new BookingServiceError(`${date} tarihinde müsait oda yok.`, "inventory");
      }
      throw new BookingServiceError(`${date} tarihinde envanter güncellenemedi.`, "inventory");
    }
  }
}

async function restoreInventoryTx(
  db: DbLike,
  hotelId: string,
  roomId: string,
  checkIn: string,
  checkOut: string,
) {
  const nights = eachStayNight(checkIn, checkOut);
  for (const date of nights) {
    const updated = await db
      .update(roomInventoryTable)
      .set({ allotment: sql`${roomInventoryTable.allotment} + 1` })
      .where(
        and(eq(roomInventoryTable.roomId, roomId), eq(roomInventoryTable.date, date)),
      )
      .returning();

    if (updated.length === 0) {
      await db.insert(roomInventoryTable).values({
        hotelId,
        roomId,
        date,
        allotment: 1,
        stopSell: false,
      });
    }
  }
}

/** Beklemede rezervasyon oluşturur — çakışan satırları kilitleyerek yarışı önler. */
export async function createPendingBooking(
  hotelId: string,
  input: Omit<
    typeof bookingsTable.$inferInsert,
    "id" | "hotelId" | "status" | "createdAt" | "updatedAt"
  >,
) {
  return withTransaction(async (tx) => {
    const candidates = await tx
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
          input.roomId ? eq(bookingsTable.roomId, input.roomId) : undefined,
        ),
      )
      .for("update");

    const checkIn = String(input.checkIn);
    const checkOut = String(input.checkOut);

    const overlap = candidates.find((b) =>
      stayRangesOverlap(checkIn, checkOut, String(b.checkIn), String(b.checkOut)),
    );
    if (overlap) {
      throw new BookingServiceError("Bu tarihlerde çakışan bir rezervasyon var.", "overlap");
    }

    const [booking] = await tx
      .insert(bookingsTable)
      .values({ ...input, hotelId, status: "beklemede" })
      .returning();

    if (!booking) {
      throw new BookingServiceError("Rezervasyon oluşturulamadı.", "invalid_state");
    }

    return booking;
  });
}

/** Rezervasyonu atomik olarak onaylar. */
export async function approveBooking(hotelId: string, bookingId: string) {
  return withTransaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(bookingsTable)
      .where(and(eq(bookingsTable.id, bookingId), eq(bookingsTable.hotelId, hotelId)))
      .for("update");

    if (!existing) {
      throw new BookingServiceError("Rezervasyon bulunamadı.", "not_found");
    }
    if (existing.status === "onaylandi") {
      return existing;
    }
    if (existing.status !== "beklemede") {
      throw new BookingServiceError("Yalnızca beklemedeki rezervasyon onaylanabilir.", "invalid_state");
    }

    const checkIn = String(existing.checkIn);
    const checkOut = String(existing.checkOut);

    const overlap = await findOverlappingBooking(
      tx,
      hotelId,
      existing.roomId,
      checkIn,
      checkOut,
      existing.id,
    );
    if (overlap) {
      throw new BookingServiceError("Onaylanamaz: tarih çakışması var.", "overlap");
    }

    if (existing.roomId) {
      await assertInventoryAvailableTx(tx, existing.roomId, checkIn, checkOut);
      await deductInventoryTx(tx, hotelId, existing.roomId, checkIn, checkOut);
    }

    const [updated] = await tx
      .update(bookingsTable)
      .set({ status: "onaylandi", updatedAt: new Date() })
      .where(eq(bookingsTable.id, bookingId))
      .returning();

    return updated;
  });
}

/** Onaylı rezervasyonu iptal/no_show ile atomik olarak günceller ve envanteri iade eder. */
export async function releaseApprovedBooking(
  hotelId: string,
  bookingId: string,
  status: "iptal" | "no_show",
) {
  return withTransaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(bookingsTable)
      .where(and(eq(bookingsTable.id, bookingId), eq(bookingsTable.hotelId, hotelId)))
      .for("update");

    if (!existing) {
      throw new BookingServiceError("Rezervasyon bulunamadı.", "not_found");
    }
    if (existing.status !== "onaylandi") {
      throw new BookingServiceError("Yalnızca onaylı rezervasyon iptal edilebilir.", "invalid_state");
    }

    if (existing.roomId) {
      await restoreInventoryTx(
        tx,
        hotelId,
        existing.roomId,
        String(existing.checkIn),
        String(existing.checkOut),
      );
    }

    const [updated] = await tx
      .update(bookingsTable)
      .set({ status, updatedAt: new Date() })
      .where(eq(bookingsTable.id, bookingId))
      .returning();

    return updated;
  });
}

/** Onayda envanter düş; iptalde geri ekle — transaction dışı legacy kullanım */
export async function adjustInventoryForBooking(
  db: DbLike,
  hotelId: string,
  roomId: string | null | undefined,
  checkIn: string,
  checkOut: string,
  delta: -1 | 1,
) {
  if (!roomId) return;

  if (delta < 0) {
    await deductInventoryTx(db, hotelId, roomId, checkIn, checkOut);
  } else {
    await restoreInventoryTx(db, hotelId, roomId, checkIn, checkOut);
  }
}

export async function assertInventoryAvailable(
  db: DbLike,
  roomId: string | null | undefined,
  checkIn: string,
  checkOut: string,
) {
  try {
    await assertInventoryAvailableTx(db, roomId, checkIn, checkOut);
    return { ok: true as const };
  } catch (err) {
    if (err instanceof BookingServiceError && err.code === "inventory") {
      return { ok: false as const, error: err.message };
    }
    throw err;
  }
}

import { and, eq, gt, inArray, ne, sql } from "drizzle-orm";
import type { Db, Tx } from "@/lib/db";
import { withTransaction } from "@/lib/db/transaction";
import {
  bookingsTable,
  bookingTransitionsTable,
  paymentsTable,
  roomInventoryTable,
  roomsTable,
} from "@/lib/db/schema";
import { eachStayNight, stayRangesOverlap } from "@/lib/stay-dates";
import { todayIso } from "@/lib/price";

const ACTIVE_STATUSES = ["beklemede", "onaylandi"] as const;

export type BookingErrorCode =
  | "not_found"
  | "overlap"
  | "inventory"
  | "invalid_state"
  | "payment_conflict";

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

/**
 * Oda TİPİ birden çok birimden oluşur (rooms.unitCount). İstenen aralığın
 * herhangi bir gecesinde aktif rezervasyon sayısı birim sayısına ulaşmışsa o
 * geceyi döner; yer varsa null. Tek çakışmayı ret saymak 40 odalı bir tipe
 * aynı anda yalnız bir rezervasyon alınmasına yol açıyordu.
 */
export async function findFullNight(
  db: DbLike,
  hotelId: string,
  roomId: string,
  unitCount: number,
  checkIn: string,
  checkOut: string,
) {
  const active = await db
    .select({
      id: bookingsTable.id,
      checkIn: bookingsTable.checkIn,
      checkOut: bookingsTable.checkOut,
    })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.hotelId, hotelId),
        eq(bookingsTable.roomId, roomId),
        inArray(bookingsTable.status, [...ACTIVE_STATUSES]),
      ),
    );
  const units = Math.max(1, unitCount);
  for (const night of eachStayNight(checkIn, checkOut)) {
    const taken = active.filter(
      (b) => String(b.checkIn) <= night && night < String(b.checkOut),
    ).length;
    if (taken >= units) return night;
  }
  return null;
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
    if (date === checkIn && row.cta) {
      throw new BookingServiceError(`${date} tarihinde girişe kapalı.`, "inventory");
    }
    if (row.minStay && nights.length < row.minStay) {
      throw new BookingServiceError(`Minimum konaklama ${row.minStay} gecedir.`, "inventory");
    }
  }
  const [departure] = await db.select({ ctd: roomInventoryTable.ctd })
    .from(roomInventoryTable)
    .where(and(eq(roomInventoryTable.roomId, roomId), eq(roomInventoryTable.date, checkOut)))
    .limit(1);
  if (departure?.ctd) throw new BookingServiceError(`${checkOut} tarihinde çıkışa kapalı.`, "inventory");
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
    if (input.roomId) {
      const [room] = await tx
        .select({
          id: roomsTable.id,
          capacityAdults: roomsTable.capacityAdults,
          capacityChildren: roomsTable.capacityChildren,
          unitCount: roomsTable.unitCount,
        })
        .from(roomsTable)
        .where(and(eq(roomsTable.id, input.roomId), eq(roomsTable.hotelId, hotelId)))
        .limit(1);
      if (!room) throw new BookingServiceError("Oda bulunamadı.", "not_found");

      // Kapasite: odanın alabileceğinden fazla misafirle rezervasyon açılmasın.
      const adults = input.adults ?? 2;
      const children = input.children ?? 0;
      if (adults > room.capacityAdults) {
        throw new BookingServiceError(
          `Bu oda en fazla ${room.capacityAdults} yetişkin alır.`,
          "invalid_state",
        );
      }
      if (children > room.capacityChildren) {
        throw new BookingServiceError(
          `Bu oda en fazla ${room.capacityChildren} çocuk alır.`,
          "invalid_state",
        );
      }

      // Çift rezervasyon koruması: bu oda tipinin tüm birimleri herhangi bir
      // gecede doluysa yenisi açılmaz. Onay anına bırakılırsa otel aynı odayı
      // iki misafire söz vermiş olur.
      const fullNight = await findFullNight(
        tx,
        hotelId,
        input.roomId,
        room.unitCount ?? 1,
        String(input.checkIn),
        String(input.checkOut),
      );
      if (fullNight) {
        throw new BookingServiceError(
          `Bu oda tipi ${fullNight} gecesi için dolu.`,
          "overlap",
        );
      }
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
export async function approveBooking(hotelId: string, bookingId: string, idempotencyKey = `approve:${bookingId}`) {
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

    if (existing.roomId) {
      const [room] = await tx.select({ id: roomsTable.id }).from(roomsTable).where(
        and(eq(roomsTable.id, existing.roomId), eq(roomsTable.hotelId, hotelId)),
      ).limit(1);
      if (!room) throw new BookingServiceError("Oda bulunamadı.", "not_found");
      await assertInventoryAvailableTx(tx, existing.roomId, checkIn, checkOut);
      await deductInventoryTx(tx, hotelId, existing.roomId, checkIn, checkOut);
    }

    const [updated] = await tx
      .update(bookingsTable)
      .set({ status: "onaylandi", updatedAt: new Date() })
      .where(eq(bookingsTable.id, bookingId))
      .returning();

    await tx.insert(bookingTransitionsTable).values({ bookingId, hotelId, action: "approve", idempotencyKey, fromStatus: "beklemede", toStatus: "onaylandi" }).onConflictDoNothing();

    return updated;
  });
}

/**
 * Rezervasyona bağlı finansal olarak "canlı" ödemeleri döner.
 * odendi → iade yapılmadan iptal/yeniden açma engellenmeli.
 */
async function findLivePayments(db: DbLike, bookingId: string) {
  return db
    .select({ id: paymentsTable.id, status: paymentsTable.status })
    .from(paymentsTable)
    .where(
      and(
        eq(paymentsTable.bookingId, bookingId),
        inArray(paymentsTable.status, ["odendi", "beklemede"]),
      ),
    );
}

/** Onaylı rezervasyonu iptal/no_show ile atomik olarak günceller ve envanteri iade eder. */
export async function releaseApprovedBooking(
  hotelId: string,
  bookingId: string,
  status: "iptal" | "no_show",
  idempotencyKey = `${status}:${bookingId}`,
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
    if (existing.status === status) return existing;
    if (existing.status === "beklemede" && status === "iptal") {
      const [updated] = await tx.update(bookingsTable).set({ status, updatedAt: new Date() }).where(eq(bookingsTable.id, bookingId)).returning();
      await tx.insert(bookingTransitionsTable).values({ bookingId, hotelId, action: "cancel", idempotencyKey, fromStatus: "beklemede", toStatus: "iptal" }).onConflictDoNothing();
      return updated;
    }
    if (existing.status !== "onaylandi") {
      throw new BookingServiceError("Yalnızca onaylı rezervasyon iptal edilebilir.", "invalid_state");
    }
    // Misafir içerideyken kayıt iptal/gelmedi yapılamaz — önce giriş geri alınır.
    if (existing.checkedInAt) {
      throw new BookingServiceError(
        "Giriş yapılmış rezervasyon iptal edilemez veya gelmedi işaretlenemez.",
        "invalid_state",
      );
    }

    // Tahsilatı yapılmış rezervasyon önce iade edilmeden kapatılamaz —
    // aksi halde ödenmiş para finansal olarak görünmez hale gelir.
    const livePayments = await findLivePayments(tx, bookingId);
    if (livePayments.some((p) => p.status === "odendi")) {
      throw new BookingServiceError(
        "Bu rezervasyonun tahsilatı yapılmış — iptal etmeden önce iade işlemini tamamlayın.",
        "payment_conflict",
      );
    }

    // Envanter yalnızca gerçek iptalde geri verilir. no_show'da oda konaklama
    // boyunca fiilen bloke kalmıştır — iade edilirse geçmiş tarihler yeniden
    // satılabilir görünür ve doluluk raporu şişer.
    if (existing.roomId && status === "iptal") {
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

    await tx.insert(bookingTransitionsTable).values({ bookingId, hotelId, action: status === "iptal" ? "cancel" : "mark_no_show", idempotencyKey, fromStatus: "onaylandi", toStatus: status }).onConflictDoNothing();

    return updated;
  });
}

export async function reopenBooking(hotelId: string, bookingId: string, idempotencyKey: string) {
  return withTransaction(async (tx) => {
    const [existing] = await tx.select().from(bookingsTable)
      .where(and(eq(bookingsTable.id, bookingId), eq(bookingsTable.hotelId, hotelId))).for("update");
    if (!existing) throw new BookingServiceError("Rezervasyon bulunamadı.", "not_found");
    if (existing.status === "beklemede") return existing;
    if (existing.status !== "iptal" && existing.status !== "no_show") throw new BookingServiceError("Yalnızca terminal rezervasyon yeniden açılabilir.", "invalid_state");
    // Açık veya tahsil edilmiş ödemesi olan rezervasyon finansal olarak kirli —
    // önce ödeme durumu netleşmeli (iade / iptal).
    const livePayments = await findLivePayments(tx, bookingId);
    if (livePayments.length > 0) {
      throw new BookingServiceError(
        "Bu rezervasyona bağlı açık veya tahsil edilmiş ödeme var — önce ödeme durumunu netleştirin.",
        "payment_conflict",
      );
    }
    // no_show envanteri iade ETMEZ (oda bloke kalmıştı). Yeniden açılan kayıt
    // sonradan onaylanırsa envanter tekrar düşüleceği için tahsisi burada geri
    // vermek gerekir; "iptal"de iade zaten yapılmıştı, tekrarlanmaz.
    if (existing.roomId && existing.status === "no_show") {
      await restoreInventoryTx(
        tx,
        hotelId,
        existing.roomId,
        String(existing.checkIn),
        String(existing.checkOut),
      );
    }

    const [updated] = await tx.update(bookingsTable).set({ status: "beklemede", updatedAt: new Date() })
      .where(eq(bookingsTable.id, bookingId)).returning();
    await tx.insert(bookingTransitionsTable).values({ bookingId, hotelId, action: "reopen", idempotencyKey, fromStatus: existing.status, toStatus: "beklemede" }).onConflictDoNothing();
    return updated;
  });
}

export type StayAction = "check_in" | "check_out" | "undo_check_in" | "undo_check_out";

/**
 * Giriş / çıkış kaydı. Durum "onaylandi" kalır; yalnız checkedInAt /
 * checkedOutAt değişir. Envantere dokunmaz — gece tahsisi onayda düşülmüştü.
 * Aynı adım tekrar gelirse kayıt olduğu gibi döner (çift tıklama güvenli).
 */
export async function recordStayStep(
  hotelId: string,
  bookingId: string,
  action: StayAction,
  idempotencyKey = `${action}:${bookingId}`,
  now: Date = new Date(),
) {
  return withTransaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(bookingsTable)
      .where(and(eq(bookingsTable.id, bookingId), eq(bookingsTable.hotelId, hotelId)))
      .for("update");
    if (!existing) throw new BookingServiceError("Rezervasyon bulunamadı.", "not_found");
    if (existing.status !== "onaylandi") {
      throw new BookingServiceError(
        "Giriş ve çıkış yalnızca onaylı rezervasyonda kaydedilir.",
        "invalid_state",
      );
    }

    let patch: { checkedInAt?: Date | null; checkedOutAt?: Date | null };
    if (action === "check_in") {
      if (existing.checkedInAt) return existing;
      // Otelin gününe göre: giriş tarihi gelmeden misafir içeri alınmış sayılmaz.
      if (todayIso(now) < String(existing.checkIn)) {
        throw new BookingServiceError(
          `Giriş tarihi ${String(existing.checkIn)} — daha erken giriş kaydedilemez.`,
          "invalid_state",
        );
      }
      patch = { checkedInAt: now };
    } else if (action === "check_out") {
      if (existing.checkedOutAt) return existing;
      if (!existing.checkedInAt) {
        throw new BookingServiceError("Önce giriş kaydedilmelidir.", "invalid_state");
      }
      patch = { checkedOutAt: now };
    } else if (action === "undo_check_out") {
      if (!existing.checkedOutAt) return existing;
      patch = { checkedOutAt: null };
    } else {
      if (!existing.checkedInAt) return existing;
      if (existing.checkedOutAt) {
        throw new BookingServiceError("Önce çıkış kaydı geri alınmalıdır.", "invalid_state");
      }
      patch = { checkedInAt: null };
    }

    const [updated] = await tx
      .update(bookingsTable)
      .set({ ...patch, updatedAt: now })
      .where(eq(bookingsTable.id, bookingId))
      .returning();
    await tx
      .insert(bookingTransitionsTable)
      .values({ bookingId, hotelId, action, idempotencyKey, fromStatus: "onaylandi", toStatus: "onaylandi" })
      .onConflictDoNothing();
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

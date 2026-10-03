// ---------------------------------------------------------------------------
// GET /api/manager/hotels/[hotelId]/bookings/calendar?baslangic=&bitis=&acik=1
//
// Takvim ve "bugün" panosu için: aralığa değen rezervasyonlar + oda tipleri.
// İptaller dönmez. acik=1 ise aralık dışında kalsa da hâlâ içeride görünen
// (giriş yapmış, çıkışı kaydedilmemiş) kayıtlar da eklenir.
// ---------------------------------------------------------------------------

import { and, asc, eq, gte, isNotNull, isNull, lte, ne, or } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { bookingsTable, roomsTable } from "@/lib/db/schema";
import { apiFail, apiOk } from "@/lib/api-response";
import { addDays } from "@/lib/booking-stay";
import { todayIso } from "@/lib/price";
import { bookingForManager } from "@/lib/manager-privacy";

type RouteParams = { params: Promise<{ hotelId: string }> };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 62;

export async function GET(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const url = new URL(req.url);
  const today = todayIso();
  const from = url.searchParams.get("baslangic") ?? today;
  const to = url.searchParams.get("bitis") ?? addDays(from, 13);
  if (!DATE.test(from) || !DATE.test(to) || to < from) {
    return apiFail("Geçersiz tarih aralığı.", 400);
  }
  if (to > addDays(from, MAX_DAYS)) {
    return apiFail(`Aralık en fazla ${MAX_DAYS} gün olabilir.`, 400);
  }

  const inRange = and(lte(bookingsTable.checkIn, to), gte(bookingsTable.checkOut, from));
  const stillInHouse = and(
    eq(bookingsTable.status, "onaylandi"),
    isNotNull(bookingsTable.checkedInAt),
    isNull(bookingsTable.checkedOutAt),
  );

  const db = getDb();
  const [rooms, bookings] = await Promise.all([
    db
      .select({ id: roomsTable.id, name: roomsTable.name, unitCount: roomsTable.unitCount })
      .from(roomsTable)
      .where(and(eq(roomsTable.hotelId, guard.hotel.id), eq(roomsTable.isActive, true)))
      .orderBy(asc(roomsTable.orderIndex), asc(roomsTable.createdAt)),
    db
      .select()
      .from(bookingsTable)
      .where(
        and(
          eq(bookingsTable.hotelId, guard.hotel.id),
          ne(bookingsTable.status, "iptal"),
          url.searchParams.get("acik") === "1" ? or(inRange, stillInHouse) : inRange,
        ),
      )
      .orderBy(asc(bookingsTable.checkIn))
      .limit(1000),
  ]);

  return apiOk({ today, from, to, rooms, bookings: bookings.map(bookingForManager) });
}

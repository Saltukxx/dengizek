// ---------------------------------------------------------------------------
// GET /api/admin/bookings — platform genelinde tüm rezervasyonlar (salt okunur)
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, desc, eq, count, type SQL } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { bookingsTable, bookingStatusEnum, hotelsTable } from "@/lib/db/schema";

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const url = new URL(req.url);
  const durum = url.searchParams.get("durum");
  const hotelId = url.searchParams.get("hotelId");
  const sayfa = Math.max(1, Number(url.searchParams.get("sayfa") ?? "1") || 1);
  const limit = 50;

  const isValidStatus = (v: string): v is (typeof bookingStatusEnum.enumValues)[number] =>
    (bookingStatusEnum.enumValues as readonly string[]).includes(v);

  const filters: SQL[] = [];
  if (durum && isValidStatus(durum)) filters.push(eq(bookingsTable.status, durum));
  if (hotelId) filters.push(eq(bookingsTable.hotelId, hotelId));

  const db = getDb();
  const base = db
    .select({
      id: bookingsTable.id,
      hotelId: bookingsTable.hotelId,
      hotelName: hotelsTable.name,
      hotelSlug: hotelsTable.slug,
      guestName: bookingsTable.guestName,
      guestEmail: bookingsTable.guestEmail,
      guestPhone: bookingsTable.guestPhone,
      checkIn: bookingsTable.checkIn,
      checkOut: bookingsTable.checkOut,
      adults: bookingsTable.adults,
      children: bookingsTable.children,
      status: bookingsTable.status,
      totalMinor: bookingsTable.totalMinor,
      currency: bookingsTable.currency,
      createdAt: bookingsTable.createdAt,
    })
    .from(bookingsTable)
    .innerJoin(hotelsTable, eq(bookingsTable.hotelId, hotelsTable.id));

  const bookings = await (filters.length > 0 ? base.where(and(...filters)) : base)
    .orderBy(desc(bookingsTable.createdAt))
    .limit(limit)
    .offset((sayfa - 1) * limit);

  const countQuery = db.select({ value: count() }).from(bookingsTable);
  const [countRow] = filters.length > 0 ? await countQuery.where(and(...filters)) : await countQuery;
  const totalCount = Number(countRow?.value ?? 0);

  const hotels = await db
    .select({ id: hotelsTable.id, name: hotelsTable.name })
    .from(hotelsTable)
    .orderBy(hotelsTable.name);

  return NextResponse.json({
    ok: true,
    bookings,
    hotels,
    sayfa,
    limit,
    totalCount,
    hasMore: sayfa * limit < totalCount,
  });
}

// ---------------------------------------------------------------------------
// GET /api/manager/hotels/[hotelId]/bookings/export — CSV dışa aktarma
// Listeyle aynı süzgeçleri alır (durum, q, baslangic, bitis).
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { bookingsTable, roomsTable } from "@/lib/db/schema";
import { bookingListWhere } from "@/lib/booking-filters";
import { stayState, stayStateLabels } from "@/lib/booking-stay";
import { redactContactInfo } from "@/lib/contact-guard";

type RouteParams = { params: Promise<{ hotelId: string }> };

function csvEscape(value: string | number | boolean | null | undefined) {
  let s = value == null ? "" : String(value);
  // Elektronik tabloda formül olarak çalışmasın (misafir adı serbest metin).
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const url = new URL(req.url);
  const db = getDb();
  const [rows, rooms] = await Promise.all([
    db
      .select()
      .from(bookingsTable)
      .where(bookingListWhere(guard.hotel.id, url.searchParams))
      .orderBy(desc(bookingsTable.checkIn))
      .limit(5000),
    db
      .select({ id: roomsTable.id, name: roomsTable.name })
      .from(roomsTable)
      .where(eq(roomsTable.hotelId, guard.hotel.id)),
  ]);
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));

  const header = [
    "misafir", "oda", "giris", "cikis", "yetiskin", "cocuk",
    "durum", "tutar", "para_birimi", "giris_kaydi", "cikis_kaydi", "notlar", "olusturulma",
  ].join(",");
  const lines = rows.map((r) =>
    [
      redactContactInfo(r.guestName), r.roomId ? roomName.get(r.roomId) ?? "" : "",
      String(r.checkIn), String(r.checkOut), r.adults, r.children,
      stayStateLabels[stayState({ ...r, checkIn: String(r.checkIn), checkOut: String(r.checkOut) })],
      r.totalMinor != null ? (r.totalMinor / 100).toFixed(2) : "", r.currency,
      r.checkedInAt?.toISOString(), r.checkedOutAt?.toISOString(), r.notes,
      r.createdAt?.toISOString(),
    ].map(csvEscape).join(","),
  );

  return new NextResponse(`\uFEFF${header}\n${lines.join("\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rezervasyonlar-${guard.hotel.slug}.csv"`,
    },
  });
}

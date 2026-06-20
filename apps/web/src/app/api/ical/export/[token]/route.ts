// ---------------------------------------------------------------------------
// GET /api/ical/export/[token] — iCal dışa aktarma (herkese açık, token ile)
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq, gte, lte } from "drizzle-orm";
import { getDb, isDbConfigured } from "@/lib/db";
import { bookingsTable, hotelIcalFeedsTable } from "@/lib/db/schema";

type RouteParams = { params: Promise<{ token: string }> };

function formatIcalDate(dateStr: string) {
  return dateStr.replace(/-/g, "");
}

export async function GET(_req: Request, { params }: RouteParams) {
  if (!isDbConfigured()) {
    return new NextResponse("Servis kullanılamıyor.", { status: 503 });
  }

  const { token } = await params;
  const db = getDb();
  const [feed] = await db
    .select()
    .from(hotelIcalFeedsTable)
    .where(eq(hotelIcalFeedsTable.exportToken, token))
    .limit(1);

  if (!feed) {
    return new NextResponse("Geçersiz token.", { status: 404 });
  }

  const now = new Date();
  const from = new Date(now);
  from.setMonth(from.getMonth() - 1);
  const to = new Date(now);
  to.setMonth(to.getMonth() + 12);

  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  const bookings = await db
    .select()
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.hotelId, feed.hotelId),
        gte(bookingsTable.checkIn, fromStr),
        lte(bookingsTable.checkOut, toStr),
      ),
    );

  const events = bookings
    .filter((b) => b.status === "onaylandi" || b.status === "beklemede")
    .map((b) => {
      const uid = `${b.id}@dengizek`;
      return [
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTART;VALUE=DATE:${formatIcalDate(b.checkIn)}`,
        `DTEND;VALUE=DATE:${formatIcalDate(b.checkOut)}`,
        `SUMMARY:${b.guestName} — ${b.status}`,
        "END:VEVENT",
      ].join("\r\n");
    })
    .join("\r\n");

  const ical = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Dengizek//TR",
    "CALSCALE:GREGORIAN",
    events,
    "END:VCALENDAR",
  ].join("\r\n");

  return new NextResponse(ical, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${feed.name}.ics"`,
    },
  });
}

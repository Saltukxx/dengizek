// ---------------------------------------------------------------------------
// GET /api/public/hotels/[slug]/availability-summary — önümüzdeki 14 gün envanter özeti
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb, isDbConfigured } from "@/lib/db";
import { hotelsTable, roomInventoryTable, roomsTable } from "@/lib/db/schema";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: true, days: [], hasLowInventory: false });
  }

  const db = getDb();
  const [hotel] = await db
    .select({ id: hotelsTable.id })
    .from(hotelsTable)
    .where(and(eq(hotelsTable.slug, slug), eq(hotelsTable.status, "yayinda")))
    .limit(1);

  if (!hotel) {
    return NextResponse.json({ ok: false, error: "Otel bulunamadı." }, { status: 404 });
  }

  const from = todayIso();
  const to = addDays(from, 13);

  const inventory = await db
    .select({
      date: roomInventoryTable.date,
      allotment: roomInventoryTable.allotment,
      stopSell: roomInventoryTable.stopSell,
      roomName: roomsTable.name,
    })
    .from(roomInventoryTable)
    .innerJoin(roomsTable, eq(roomInventoryTable.roomId, roomsTable.id))
    .where(
      and(
        eq(roomInventoryTable.hotelId, hotel.id),
        gte(roomInventoryTable.date, from),
        lte(roomInventoryTable.date, to),
        eq(roomsTable.isActive, true),
      ),
    )
    .orderBy(asc(roomInventoryTable.date));

  const days = inventory
    .filter((row) => row.stopSell || row.allotment <= 1)
    .map((row) => ({
      date: String(row.date),
      roomName: row.roomName,
      allotment: row.allotment,
      stopSell: row.stopSell,
    }));

  return NextResponse.json({
    ok: true,
    from,
    to,
    days,
    hasLowInventory: days.length > 0,
  });
}

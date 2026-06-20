import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, isDbConfigured } from "@/lib/db";
import { hotelsTable, roomsTable } from "@/lib/db/schema";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: true, rooms: [] });
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

  const rooms = await db
    .select({ slug: roomsTable.slug, name: roomsTable.name })
    .from(roomsTable)
    .where(and(eq(roomsTable.hotelId, hotel.id), eq(roomsTable.isActive, true)))
    .orderBy(roomsTable.orderIndex);

  return NextResponse.json({ ok: true, rooms });
}

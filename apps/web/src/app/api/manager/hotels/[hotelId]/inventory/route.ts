// ---------------------------------------------------------------------------
// GET/PUT /api/manager/hotels/[hotelId]/inventory — günlük oda envanteri
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { roomInventoryTable } from "@/lib/db/schema";
import { inventoryPutSchema } from "@/lib/schemas/hotel-panel";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function GET(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const roomId = url.searchParams.get("roomId");

  const db = getDb();
  const filters = [eq(roomInventoryTable.hotelId, guard.hotel.id)];
  if (from) filters.push(gte(roomInventoryTable.date, from));
  if (to) filters.push(lte(roomInventoryTable.date, to));
  if (roomId) filters.push(eq(roomInventoryTable.roomId, roomId));

  const inventory = await db
    .select()
    .from(roomInventoryTable)
    .where(and(...filters))
    .orderBy(asc(roomInventoryTable.date));

  return NextResponse.json({ ok: true, inventory });
}

export async function PUT(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = inventoryPutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  for (const entry of parsed.data.entries) {
    await db
      .insert(roomInventoryTable)
      .values({ ...entry, hotelId: guard.hotel.id })
      .onConflictDoUpdate({
        target: [roomInventoryTable.roomId, roomInventoryTable.date],
        set: {
          allotment: entry.allotment,
          stopSell: entry.stopSell,
          minStay: entry.minStay ?? null,
          cta: entry.cta,
          ctd: entry.ctd,
        },
      });
  }

  return NextResponse.json({ ok: true, count: parsed.data.entries.length });
}

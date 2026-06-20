// ---------------------------------------------------------------------------
// POST /api/manager/hotels/[hotelId]/rooms/reorder — tek SQL ile sıralama
// (neon-http transaction desteklemez — adım reorder ile aynı kalıp)
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { roomsTable } from "@/lib/db/schema";
import { roomsReorderSchema } from "@/lib/schemas/hotel-content";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = roomsReorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const sirali = parsed.data.sirali;
  if (new Set(sirali).size !== sirali.length) {
    return NextResponse.json(
      { ok: false, error: "Sıralama listesinde tekrar eden oda var." },
      { status: 400 },
    );
  }

  const db = getDb();
  const existing = await db
    .select({ id: roomsTable.id })
    .from(roomsTable)
    .where(eq(roomsTable.hotelId, guard.hotel.id));
  const existingIds = new Set(existing.map((r) => r.id));
  if (existingIds.size !== sirali.length || sirali.some((id) => !existingIds.has(id))) {
    return NextResponse.json(
      { ok: false, error: "Sıralama listesi mevcut odalarla eşleşmiyor." },
      { status: 400 },
    );
  }

  await db.execute(sql`
    UPDATE rooms AS r
    SET order_index = v.ord - 1
    FROM unnest(
      ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(sirali)}::jsonb))
    ) WITH ORDINALITY AS v(room_id, ord)
    WHERE r.hotel_id = ${guard.hotel.id}
      AND r.id = v.room_id::uuid
  `);

  return NextResponse.json({ ok: true });
}

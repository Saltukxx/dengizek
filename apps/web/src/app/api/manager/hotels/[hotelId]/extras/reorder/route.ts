// ---------------------------------------------------------------------------
// POST /api/manager/hotels/[hotelId]/extras/reorder
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { extrasTable } from "@/lib/db/schema";
import { reorderSchema } from "@/lib/schemas/hotel-panel";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const sirali = parsed.data.sirali;
  const db = getDb();
  const existing = await db
    .select({ id: extrasTable.id })
    .from(extrasTable)
    .where(eq(extrasTable.hotelId, guard.hotel.id));
  const existingIds = new Set(existing.map((r) => r.id));
  if (existingIds.size !== sirali.length || sirali.some((id) => !existingIds.has(id))) {
    return NextResponse.json(
      { ok: false, error: "Sıralama listesi mevcut kayıtlarla eşleşmiyor." },
      { status: 400 },
    );
  }

  await db.execute(sql`
    UPDATE extras AS e
    SET order_index = v.ord - 1
    FROM unnest(
      ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(sirali)}::jsonb))
    ) WITH ORDINALITY AS v(item_id, ord)
    WHERE e.hotel_id = ${guard.hotel.id}
      AND e.id = v.item_id::uuid
  `);

  return NextResponse.json({ ok: true });
}

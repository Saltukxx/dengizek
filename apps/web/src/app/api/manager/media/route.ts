// ---------------------------------------------------------------------------
// GET /api/manager/media?hotelId= — otelin medya varlıkları
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { mediaAssetsTable } from "@/lib/db/schema";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const hotelId = url.searchParams.get("hotelId");
  if (!hotelId) {
    return NextResponse.json(
      { ok: false, error: "hotelId parametresi gerekli." },
      { status: 400 },
    );
  }

  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const db = getDb();
  const media = await db
    .select()
    .from(mediaAssetsTable)
    .where(eq(mediaAssetsTable.hotelId, guard.hotel.id))
    .orderBy(desc(mediaAssetsTable.createdAt));

  return NextResponse.json({ ok: true, media });
}

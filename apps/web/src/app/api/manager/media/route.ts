// ---------------------------------------------------------------------------
// GET /api/manager/media?hotelId= — otelin medya varlıkları
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { mediaAssetsTable } from "@/lib/db/schema";
import { parsePagination, paginatedQuery } from "@/lib/pagination";

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

  const pagination = parsePagination(url);
  const db = getDb();
  const where = eq(mediaAssetsTable.hotelId, guard.hotel.id);
  const result = await paginatedQuery({
    db,
    table: mediaAssetsTable,
    where,
    orderBy: desc(mediaAssetsTable.createdAt),
    pagination,
  });

  return NextResponse.json({
    ok: true,
    media: result.items,
    sayfa: result.sayfa,
    limit: result.limit,
    totalCount: result.totalCount,
    hasMore: result.hasMore,
  });
}

// ---------------------------------------------------------------------------
// GET /api/admin/tours — inceleme kuyruğu (incelemede öncelikli)
// ?durum= ile filtrelenebilir
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { hotelsTable, moderationStatusEnum, toursTable } from "@/lib/db/schema";

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const url = new URL(req.url);
  const durum = url.searchParams.get("durum");
  const isValidStatus = (v: string): v is (typeof moderationStatusEnum.enumValues)[number] =>
    (moderationStatusEnum.enumValues as readonly string[]).includes(v);

  const db = getDb();
  const selection = {
    id: toursTable.id,
    tourId: toursTable.tourId,
    title: toursTable.title,
    status: toursTable.status,
    moderationNote: toursTable.moderationNote,
    version: toursTable.version,
    submittedAt: toursTable.submittedAt,
    publishedAt: toursTable.publishedAt,
    hotelSlug: toursTable.hotelSlug,
    hotelName: hotelsTable.name,
  };

  const baseQuery = db
    .select(selection)
    .from(toursTable)
    .innerJoin(hotelsTable, eq(toursTable.hotelId, hotelsTable.id));

  // incelemede olanlar en üstte, sonra son güncellenenler
  const orderExpr = sql`CASE WHEN ${toursTable.status} = 'incelemede' THEN 0 ELSE 1 END`;

  const tours =
    durum && isValidStatus(durum)
      ? await baseQuery.where(eq(toursTable.status, durum)).orderBy(orderExpr, desc(toursTable.updatedAt))
      : await baseQuery.orderBy(orderExpr, desc(toursTable.updatedAt));

  return NextResponse.json({ ok: true, tours });
}

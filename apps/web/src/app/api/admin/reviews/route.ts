// ---------------------------------------------------------------------------
// GET /api/admin/reviews — yorum moderasyon listesi
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { hotelsTable, reviewsTable, reviewStatusEnum } from "@/lib/db/schema";

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const url = new URL(req.url);
  const durum = url.searchParams.get("durum");
  const hotelId = url.searchParams.get("hotelId");
  const sayfa = Math.max(1, Number(url.searchParams.get("sayfa") ?? "1") || 1);
  const limit = 50;

  const isValidStatus = (v: string): v is (typeof reviewStatusEnum.enumValues)[number] =>
    (reviewStatusEnum.enumValues as readonly string[]).includes(v);

  const filters: SQL[] = [];
  if (durum && isValidStatus(durum)) filters.push(eq(reviewsTable.status, durum));
  if (hotelId) filters.push(eq(reviewsTable.hotelId, hotelId));

  const db = getDb();
  const base = db
    .select({
      id: reviewsTable.id,
      hotelId: reviewsTable.hotelId,
      hotelName: hotelsTable.name,
      hotelSlug: hotelsTable.slug,
      rating: reviewsTable.rating,
      title: reviewsTable.title,
      body: reviewsTable.body,
      guestName: reviewsTable.guestName,
      stayDate: reviewsTable.stayDate,
      status: reviewsTable.status,
      createdAt: reviewsTable.createdAt,
    })
    .from(reviewsTable)
    .innerJoin(hotelsTable, eq(reviewsTable.hotelId, hotelsTable.id));

  const reviews = await (filters.length > 0 ? base.where(and(...filters)) : base)
    .orderBy(desc(reviewsTable.createdAt))
    .limit(limit)
    .offset((sayfa - 1) * limit);

  const hotels = await db
    .select({ id: hotelsTable.id, name: hotelsTable.name })
    .from(hotelsTable)
    .orderBy(hotelsTable.name);

  return NextResponse.json({ ok: true, reviews, hotels, sayfa });
}

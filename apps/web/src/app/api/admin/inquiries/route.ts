// ---------------------------------------------------------------------------
// GET /api/admin/inquiries — tüm misafir talepleri (otel/durum/kaynak filtreli)
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { desc, eq, and, count, type SQL } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { hotelsTable, inquiriesTable, inquirySourceEnum, inquiryStatusEnum } from "@/lib/db/schema";

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const url = new URL(req.url);
  const durum = url.searchParams.get("durum");
  const hotelId = url.searchParams.get("hotelId");
  const kaynak = url.searchParams.get("kaynak");
  const sayfa = Math.max(1, Number(url.searchParams.get("sayfa") ?? "1") || 1);
  const limit = 50;

  const filters: SQL[] = [];
  const isValidStatus = (v: string): v is (typeof inquiryStatusEnum.enumValues)[number] =>
    (inquiryStatusEnum.enumValues as readonly string[]).includes(v);
  const isValidSource = (v: string): v is (typeof inquirySourceEnum.enumValues)[number] =>
    (inquirySourceEnum.enumValues as readonly string[]).includes(v);
  if (durum && isValidStatus(durum)) filters.push(eq(inquiriesTable.status, durum));
  if (hotelId) filters.push(eq(inquiriesTable.hotelId, hotelId));
  if (kaynak && isValidSource(kaynak)) filters.push(eq(inquiriesTable.source, kaynak));

  const db = getDb();
  const base = db
    .select({
      id: inquiriesTable.id,
      hotelId: inquiriesTable.hotelId,
      hotelSlug: inquiriesTable.hotelSlug,
      hotelName: hotelsTable.name,
      name: inquiriesTable.name,
      email: inquiriesTable.email,
      phone: inquiriesTable.phone,
      message: inquiriesTable.message,
      status: inquiriesTable.status,
      source: inquiriesTable.source,
      checkIn: inquiriesTable.checkIn,
      checkOut: inquiriesTable.checkOut,
      adults: inquiriesTable.adults,
      children: inquiriesTable.children,
      roomSlug: inquiriesTable.roomSlug,
      tourId: inquiriesTable.tourId,
      stepKey: inquiriesTable.stepKey,
      locale: inquiriesTable.locale,
      marketingConsent: inquiriesTable.marketingConsent,
      createdAt: inquiriesTable.createdAt,
    })
    .from(inquiriesTable)
    .leftJoin(hotelsTable, eq(inquiriesTable.hotelId, hotelsTable.id));

  const inquiries = await (filters.length > 0 ? base.where(and(...filters)) : base)
    .orderBy(desc(inquiriesTable.createdAt))
    .limit(limit)
    .offset((sayfa - 1) * limit);

  const countQuery = db.select({ value: count() }).from(inquiriesTable);
  const [countRow] =
    filters.length > 0 ? await countQuery.where(and(...filters)) : await countQuery;
  const totalCount = Number(countRow?.value ?? 0);

  const hotels = await db
    .select({ id: hotelsTable.id, name: hotelsTable.name, slug: hotelsTable.slug })
    .from(hotelsTable)
    .orderBy(hotelsTable.name);

  return NextResponse.json({
    ok: true,
    inquiries,
    hotels,
    sayfa,
    limit,
    totalCount,
    hasMore: sayfa * limit < totalCount,
  });
}

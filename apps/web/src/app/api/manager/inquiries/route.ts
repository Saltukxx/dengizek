// ---------------------------------------------------------------------------
// GET /api/manager/inquiries?hotelId=&durum=&sayfa= — otelin talepleri
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, desc, eq, count, type SQL } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { inquiriesTable, inquirySourceEnum, inquiryStatusEnum } from "@/lib/db/schema";
import { parsePagination, paginatedMeta } from "@/lib/pagination";

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

  const durum = url.searchParams.get("durum");
  const kaynak = url.searchParams.get("kaynak");
  const pagination = parsePagination(url);

  const isValidStatus = (v: string): v is (typeof inquiryStatusEnum.enumValues)[number] =>
    (inquiryStatusEnum.enumValues as readonly string[]).includes(v);
  const isValidSource = (v: string): v is (typeof inquirySourceEnum.enumValues)[number] =>
    (inquirySourceEnum.enumValues as readonly string[]).includes(v);

  const filters: SQL[] = [eq(inquiriesTable.hotelId, guard.hotel.id)];
  if (durum && isValidStatus(durum)) filters.push(eq(inquiriesTable.status, durum));
  if (kaynak && isValidSource(kaynak)) filters.push(eq(inquiriesTable.source, kaynak));

  const db = getDb();
  const where = and(...filters);

  const [inquiries, [countRow]] = await Promise.all([
    db
      .select()
      .from(inquiriesTable)
      .where(where)
      .orderBy(desc(inquiriesTable.createdAt))
      .limit(pagination.limit)
      .offset(pagination.offset),
    db.select({ value: count() }).from(inquiriesTable).where(where),
  ]);

  const totalCount = Number(countRow?.value ?? 0);
  const result = paginatedMeta(inquiries, { ...pagination, totalCount });

  return NextResponse.json({
    ok: true,
    inquiries: result.items,
    sayfa: result.sayfa,
    limit: result.limit,
    totalCount: result.totalCount,
    hasMore: result.hasMore,
  });
}

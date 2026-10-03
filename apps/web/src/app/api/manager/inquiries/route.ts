// ---------------------------------------------------------------------------
// GET /api/manager/inquiries?hotelId=&durum=&sayfa= — otelin talepleri
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, desc, eq, count, ilike, or, type SQL } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { inquiriesTable, inquirySourceEnum, inquiryStatusEnum } from "@/lib/db/schema";
import { parsePagination, paginatedMeta } from "@/lib/pagination";
import { inquiryForManager } from "@/lib/manager-privacy";

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
  // Misafir adı veya mesaj içinde arama — iletişim bilgisi aranmaz.
  const q = url.searchParams.get("q")?.trim().slice(0, 120);
  if (q) {
    const pattern = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    const match = or(
      ilike(inquiriesTable.name, pattern),
      ilike(inquiriesTable.message, pattern),
    );
    if (match) filters.push(match);
  }

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
    inquiries: result.items.map(inquiryForManager),
    sayfa: result.sayfa,
    limit: result.limit,
    totalCount: result.totalCount,
    hasMore: result.hasMore,
  });
}

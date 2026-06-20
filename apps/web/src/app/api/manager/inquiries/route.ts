// ---------------------------------------------------------------------------
// GET /api/manager/inquiries?hotelId=&durum=&sayfa= — otelin talepleri
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { hotelsTable, inquiriesTable, inquirySourceEnum, inquiryStatusEnum } from "@/lib/db/schema";

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
  const sayfa = Math.max(1, Number(url.searchParams.get("sayfa") ?? "1") || 1);
  const limit = 50;

  const isValidStatus = (v: string): v is (typeof inquiryStatusEnum.enumValues)[number] =>
    (inquiryStatusEnum.enumValues as readonly string[]).includes(v);
  const isValidSource = (v: string): v is (typeof inquirySourceEnum.enumValues)[number] =>
    (inquirySourceEnum.enumValues as readonly string[]).includes(v);

  const filters: SQL[] = [eq(inquiriesTable.hotelId, guard.hotel.id)];
  if (durum && isValidStatus(durum)) filters.push(eq(inquiriesTable.status, durum));
  if (kaynak && isValidSource(kaynak)) filters.push(eq(inquiriesTable.source, kaynak));

  const db = getDb();
  const inquiries = await db
    .select()
    .from(inquiriesTable)
    .where(and(...filters))
    .orderBy(desc(inquiriesTable.createdAt))
    .limit(limit)
    .offset((sayfa - 1) * limit);

  return NextResponse.json({ ok: true, inquiries, sayfa });
}

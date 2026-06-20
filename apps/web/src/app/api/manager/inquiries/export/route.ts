// ---------------------------------------------------------------------------
// GET /api/manager/inquiries/export — CSV dışa aktarma
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { inquiriesTable, inquirySourceEnum, inquiryStatusEnum } from "@/lib/db/schema";

function csvEscape(value: string | number | boolean | null | undefined) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const hotelId = url.searchParams.get("hotelId");
  if (!hotelId) {
    return NextResponse.json({ ok: false, error: "hotelId gerekli." }, { status: 400 });
  }

  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const durum = url.searchParams.get("durum");
  const kaynak = url.searchParams.get("kaynak");

  const isValidStatus = (v: string): v is (typeof inquiryStatusEnum.enumValues)[number] =>
    (inquiryStatusEnum.enumValues as readonly string[]).includes(v);
  const isValidSource = (v: string): v is (typeof inquirySourceEnum.enumValues)[number] =>
    (inquirySourceEnum.enumValues as readonly string[]).includes(v);

  const filters: SQL[] = [eq(inquiriesTable.hotelId, guard.hotel.id)];
  if (durum && isValidStatus(durum)) filters.push(eq(inquiriesTable.status, durum));
  if (kaynak && isValidSource(kaynak)) filters.push(eq(inquiriesTable.source, kaynak));

  const db = getDb();
  const rows = await db
    .select()
    .from(inquiriesTable)
    .where(and(...filters))
    .orderBy(desc(inquiriesTable.createdAt));

  const header = [
    "id", "name", "email", "phone", "message", "status", "source", "marketingConsent",
    "checkIn", "checkOut", "adults", "children", "roomSlug", "tourId", "createdAt",
  ].join(",");

  const lines = rows.map((r) =>
    [
      r.id, r.name, r.email, r.phone, r.message, r.status, r.source, r.marketingConsent,
      r.checkIn, r.checkOut, r.adults, r.children, r.roomSlug, r.tourId,
      r.createdAt?.toISOString(),
    ].map(csvEscape).join(","),
  );

  const csv = `\uFEFF${header}\n${lines.join("\n")}`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="talepler-${guard.hotel.slug}.csv"`,
    },
  });
}

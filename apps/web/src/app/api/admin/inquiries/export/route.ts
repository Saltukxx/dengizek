// ---------------------------------------------------------------------------
// GET /api/admin/inquiries/export — platform CSV dışa aktarma
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { inquiriesTable, inquirySourceEnum, inquiryStatusEnum } from "@/lib/db/schema";

function csvEscape(value: string | number | boolean | null | undefined) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const url = new URL(req.url);
  const durum = url.searchParams.get("durum");
  const hotelId = url.searchParams.get("hotelId");
  const kaynak = url.searchParams.get("kaynak");

  const isValidStatus = (v: string): v is (typeof inquiryStatusEnum.enumValues)[number] =>
    (inquiryStatusEnum.enumValues as readonly string[]).includes(v);
  const isValidSource = (v: string): v is (typeof inquirySourceEnum.enumValues)[number] =>
    (inquirySourceEnum.enumValues as readonly string[]).includes(v);

  const filters: SQL[] = [];
  if (durum && isValidStatus(durum)) filters.push(eq(inquiriesTable.status, durum));
  if (hotelId) filters.push(eq(inquiriesTable.hotelId, hotelId));
  if (kaynak && isValidSource(kaynak)) filters.push(eq(inquiriesTable.source, kaynak));

  const db = getDb();
  const base = db.select().from(inquiriesTable);
  const rows = await (filters.length > 0 ? base.where(and(...filters)) : base)
    .orderBy(desc(inquiriesTable.createdAt));

  const header = [
    "id", "hotelId", "hotelSlug", "name", "email", "phone", "message", "status", "source",
    "marketingConsent", "checkIn", "checkOut", "adults", "children", "roomSlug", "tourId", "createdAt",
  ].join(",");

  const lines = rows.map((r) =>
    [
      r.id, r.hotelId, r.hotelSlug, r.name, r.email, r.phone, r.message, r.status, r.source,
      r.marketingConsent, r.checkIn, r.checkOut, r.adults, r.children, r.roomSlug, r.tourId,
      r.createdAt?.toISOString(),
    ].map(csvEscape).join(","),
  );

  const csv = `\uFEFF${header}\n${lines.join("\n")}`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="platform-talepler.csv"',
    },
  });
}

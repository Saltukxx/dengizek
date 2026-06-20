// ---------------------------------------------------------------------------
// GET /api/admin/inquiries — tüm misafir talepleri (otel/durum filtreli)
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { desc, eq, and, type SQL } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { hotelsTable, inquiriesTable, inquiryStatusEnum } from "@/lib/db/schema";

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const url = new URL(req.url);
  const durum = url.searchParams.get("durum");
  const hotelId = url.searchParams.get("hotelId");
  const sayfa = Math.max(1, Number(url.searchParams.get("sayfa") ?? "1") || 1);
  const limit = 50;

  const filters: SQL[] = [];
  const isValidStatus = (v: string): v is (typeof inquiryStatusEnum.enumValues)[number] =>
    (inquiryStatusEnum.enumValues as readonly string[]).includes(v);
  if (durum && isValidStatus(durum)) filters.push(eq(inquiriesTable.status, durum));
  if (hotelId) filters.push(eq(inquiriesTable.hotelId, hotelId));

  const db = getDb();
  const base = db
    .select({
      id: inquiriesTable.id,
      hotelSlug: inquiriesTable.hotelSlug,
      hotelName: hotelsTable.name,
      name: inquiriesTable.name,
      email: inquiriesTable.email,
      phone: inquiriesTable.phone,
      message: inquiriesTable.message,
      status: inquiriesTable.status,
      createdAt: inquiriesTable.createdAt,
    })
    .from(inquiriesTable)
    .leftJoin(hotelsTable, eq(inquiriesTable.hotelId, hotelsTable.id));

  const inquiries = await (filters.length > 0 ? base.where(and(...filters)) : base)
    .orderBy(desc(inquiriesTable.createdAt))
    .limit(limit)
    .offset((sayfa - 1) * limit);

  return NextResponse.json({ ok: true, inquiries, sayfa });
}

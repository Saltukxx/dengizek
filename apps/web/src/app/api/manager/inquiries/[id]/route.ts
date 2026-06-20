// ---------------------------------------------------------------------------
// PATCH /api/manager/inquiries/[id] — talep durumunu güncelle
// (yeni → ilgileniliyor → kapatildi)
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { inquiriesTable } from "@/lib/db/schema";

const statusUpdateSchema = z.object({
  durum: z.enum(["yeni", "ilgileniliyor", "kapatildi"], {
    message: "Geçersiz talep durumu",
  }),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: RouteParams) {
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = statusUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const [inquiry] = await db
    .select({ id: inquiriesTable.id, hotelId: inquiriesTable.hotelId })
    .from(inquiriesTable)
    .where(eq(inquiriesTable.id, id))
    .limit(1);

  if (!inquiry) {
    return NextResponse.json({ ok: false, error: "Talep bulunamadı." }, { status: 404 });
  }
  if (!inquiry.hotelId) {
    return NextResponse.json(
      { ok: false, error: "Bu talep bir tesise bağlı değil." },
      { status: 400 },
    );
  }

  // Yetki: talebin ait olduğu otel üzerinden
  const guard = await requireHotelAccess(inquiry.hotelId);
  if (guard.response) return guard.response;

  const now = new Date();
  const [updated] = await db
    .update(inquiriesTable)
    .set({
      status: parsed.data.durum,
      handledBy: parsed.data.durum === "yeni" ? null : guard.user.id,
      handledAt: parsed.data.durum === "yeni" ? null : now,
    })
    .where(eq(inquiriesTable.id, inquiry.id))
    .returning({ id: inquiriesTable.id, status: inquiriesTable.status });

  return NextResponse.json({ ok: true, inquiry: updated });
}

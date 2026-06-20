// ---------------------------------------------------------------------------
// POST /api/admin/hotels/[hotelId]/moderation — onayla / reddet
// onayla → yayinda; reddet → reddedildi (not zorunlu)
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { hotelsTable } from "@/lib/db/schema";
import { moderationDecisionSchema } from "@/lib/schemas/hotel-admin";
import { logAudit } from "@/lib/audit";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const { hotelId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = moderationDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const [hotel] = await db
    .select({ id: hotelsTable.id, status: hotelsTable.status, slug: hotelsTable.slug })
    .from(hotelsTable)
    .where(eq(hotelsTable.id, hotelId))
    .limit(1);

  if (!hotel) {
    return NextResponse.json({ ok: false, error: "Tesis bulunamadı." }, { status: 404 });
  }

  const yeniDurum = parsed.data.karar === "onayla" ? "yayinda" : "reddedildi";
  const now = new Date();

  const [updated] = await db
    .update(hotelsTable)
    .set({
      status: yeniDurum,
      moderationNote: parsed.data.not?.trim() || null,
      reviewedAt: now,
      reviewedBy: guard.user.id,
      updatedAt: now,
    })
    .where(eq(hotelsTable.id, hotel.id))
    .returning({ status: hotelsTable.status });

  await logAudit({
    actor: guard.user,
    action: parsed.data.karar === "onayla" ? "otel.onaylandi" : "otel.reddedildi",
    entityType: "hotel",
    entityId: hotel.id,
    meta: { slug: hotel.slug, eskiDurum: hotel.status, yeniDurum, not: parsed.data.not },
  });

  return NextResponse.json({ ok: true, status: updated.status });
}

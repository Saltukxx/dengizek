// ---------------------------------------------------------------------------
// PATCH /api/admin/reviews/[id]/moderation — yorum moderasyonu
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { reviewsTable } from "@/lib/db/schema";
import { reviewModerationSchema } from "@/lib/schemas/hotel-panel";
import { logAudit } from "@/lib/audit";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: RouteParams) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = reviewModerationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const [updated] = await db
    .update(reviewsTable)
    .set({ status: parsed.data.status })
    .where(eq(reviewsTable.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ ok: false, error: "Yorum bulunamadı." }, { status: 404 });
  }

  await logAudit({
    actor: guard.user,
    action: parsed.data.status === "yayinda" ? "yorum.onaylandi" : "yorum.reddedildi",
    entityType: "hotel",
    entityId: updated.hotelId,
    meta: { reviewId: id },
  });

  return NextResponse.json({ ok: true, review: updated });
}

// ---------------------------------------------------------------------------
// POST /api/admin/hotels/[hotelId]/suspend — acil durdurma / kaldırma
// Moderasyon durumundan bağımsız: doluysa misafir tarafında anında gizlenir.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { hotelsTable } from "@/lib/db/schema";
import { logAudit } from "@/lib/audit";

type RouteParams = { params: Promise<{ hotelId: string }> };

const suspendSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("suspend"), note: z.string().min(1).max(1000) }),
  z.object({ action: z.literal("unsuspend") }),
]);

export async function POST(req: Request, { params }: RouteParams) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const { hotelId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = suspendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const [hotel] = await db
    .select({ id: hotelsTable.id, slug: hotelsTable.slug })
    .from(hotelsTable)
    .where(eq(hotelsTable.id, hotelId))
    .limit(1);
  if (!hotel) {
    return NextResponse.json({ ok: false, error: "Tesis bulunamadı." }, { status: 404 });
  }

  const now = new Date();
  const data = parsed.data;
  const suspending = data.action === "suspend";
  const note = data.action === "suspend" ? data.note.trim() : null;

  const [updated] = await db
    .update(hotelsTable)
    .set({
      suspendedAt: suspending ? now : null,
      suspensionNote: note,
      updatedAt: now,
    })
    .where(eq(hotelsTable.id, hotel.id))
    .returning();

  await logAudit({
    actor: guard.user,
    action: suspending ? "otel.askiya_alindi" : "otel.askidan_kaldirildi",
    entityType: "hotel",
    entityId: hotel.id,
    meta: { slug: hotel.slug, not: note ?? undefined },
  });

  return NextResponse.json({
    ok: true,
    suspendedAt: updated.suspendedAt,
    suspensionNote: updated.suspensionNote,
  });
}

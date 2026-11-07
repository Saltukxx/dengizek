// ---------------------------------------------------------------------------
// POST /api/admin/hotels/[hotelId]/analytics-access — analitik erişimini aç/kapa
//
// Yayın durumundan bağımsız: otel yayında olsa bile, bu bayrak açılmadıkça
// tesis yöneticisi analitik sayfasını göremez (bkz. requireAnalyticsAccess).
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { validationMessage } from "@/lib/api-response";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { hotelsTable } from "@/lib/db/schema";
import { logAudit } from "@/lib/audit";

type RouteParams = { params: Promise<{ hotelId: string }> };

const schema = z.object({ enabled: z.boolean() });

export async function POST(req: Request, { params }: RouteParams) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const { hotelId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: validationMessage(parsed.error), issues: parsed.error.flatten() },
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

  const { enabled } = parsed.data;
  const [updated] = await db
    .update(hotelsTable)
    .set({ analyticsEnabled: enabled, updatedAt: new Date() })
    .where(eq(hotelsTable.id, hotel.id))
    .returning();

  await logAudit({
    actor: guard.user,
    action: enabled ? "otel.analitik_acildi" : "otel.analitik_kapatildi",
    entityType: "hotel",
    entityId: hotel.id,
    meta: { slug: hotel.slug },
  });

  return NextResponse.json({ ok: true, analyticsEnabled: updated.analyticsEnabled });
}

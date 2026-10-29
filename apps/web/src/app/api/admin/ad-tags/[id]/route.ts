// ---------------------------------------------------------------------------
// PATCH  /api/admin/ad-tags/[id] — kimlikleri düzenle / aç-kapat
// DELETE /api/admin/ad-tags/[id] — sil
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { adTagsTable } from "@/lib/db/schema";
import { adTagUpdateSchema } from "@/lib/schemas/ad-tags";
import { clearAdTagCache } from "@/lib/ad-tags-repo";
import { logAudit } from "@/lib/audit";

type RouteParams = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function PATCH(req: Request, { params }: RouteParams) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "Kod bulunamadı." }, { status: 404 });

  const parsed = adTagUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Doğrulama başarısız" }, { status: 400 });
  }
  const data = parsed.data;
  const set: Partial<typeof adTagsTable.$inferInsert> = { updatedAt: new Date() };
  if (data.enabled !== undefined) set.enabled = data.enabled;
  if ("googleAdsId" in data) set.googleAdsId = data.googleAdsId ?? null;
  if ("conversionLabel" in data) set.conversionLabel = data.conversionLabel ?? null;
  if ("ga4Id" in data) set.ga4Id = data.ga4Id ?? null;
  if ("note" in data) set.note = data.note || null;

  const [updated] = await getDb().update(adTagsTable).set(set).where(eq(adTagsTable.id, id)).returning();
  if (!updated) return NextResponse.json({ ok: false, error: "Kod bulunamadı." }, { status: 404 });

  clearAdTagCache();
  await logAudit({
    actor: guard.user,
    action: data.enabled === undefined ? "reklam_kodu.duzenlendi" : data.enabled ? "reklam_kodu.acildi" : "reklam_kodu.kapatildi",
    entityType: "ad_tag",
    entityId: id,
    meta: { googleAdsId: updated.googleAdsId, conversionLabel: updated.conversionLabel, ga4Id: updated.ga4Id },
  });
  return NextResponse.json({ ok: true, tag: updated });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "Kod bulunamadı." }, { status: 404 });

  const [deleted] = await getDb().delete(adTagsTable).where(eq(adTagsTable.id, id)).returning();
  if (!deleted) return NextResponse.json({ ok: false, error: "Kod bulunamadı." }, { status: 404 });

  clearAdTagCache();
  await logAudit({
    actor: guard.user,
    action: "reklam_kodu.silindi",
    entityType: "ad_tag",
    entityId: id,
    meta: { pagePath: deleted.pagePath, hotelId: deleted.hotelId, googleAdsId: deleted.googleAdsId, ga4Id: deleted.ga4Id },
  });
  return NextResponse.json({ ok: true });
}

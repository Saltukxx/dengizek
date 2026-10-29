// ---------------------------------------------------------------------------
// GET  /api/admin/ad-tags — reklam kodları + seçim listeleri (sayfalar, oteller)
// POST /api/admin/ad-tags — yeni kod (sayfaya ya da otele bağlı)
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { asc, desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { adTagsTable, hotelsTable } from "@/lib/db/schema";
import { adTagCreateSchema } from "@/lib/schemas/ad-tags";
import { AD_TAG_PAGES } from "@/lib/ad-tags";
import { clearAdTagCache } from "@/lib/ad-tags-repo";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const db = getDb();
  const [tags, hotels] = await Promise.all([
    db
      .select({
        id: adTagsTable.id,
        pagePath: adTagsTable.pagePath,
        hotelId: adTagsTable.hotelId,
        hotelName: hotelsTable.name,
        hotelSlug: hotelsTable.slug,
        googleAdsId: adTagsTable.googleAdsId,
        conversionLabel: adTagsTable.conversionLabel,
        ga4Id: adTagsTable.ga4Id,
        note: adTagsTable.note,
        enabled: adTagsTable.enabled,
        updatedAt: adTagsTable.updatedAt,
      })
      .from(adTagsTable)
      .leftJoin(hotelsTable, eq(adTagsTable.hotelId, hotelsTable.id))
      .orderBy(asc(adTagsTable.pagePath), asc(hotelsTable.name), desc(adTagsTable.createdAt)),
    db.select({ id: hotelsTable.id, name: hotelsTable.name, slug: hotelsTable.slug }).from(hotelsTable).orderBy(asc(hotelsTable.name)),
  ]);

  return NextResponse.json({ ok: true, tags, hotels, pages: AD_TAG_PAGES });
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const parsed = adTagCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Doğrulama başarısız" }, { status: 400 });
  }
  const data = parsed.data;
  const db = getDb();

  if (data.hotelId) {
    const [hotel] = await db.select({ id: hotelsTable.id }).from(hotelsTable).where(eq(hotelsTable.id, data.hotelId)).limit(1);
    if (!hotel) return NextResponse.json({ ok: false, error: "Otel bulunamadı." }, { status: 404 });
  }

  const [created] = await db
    .insert(adTagsTable)
    .values({
      pagePath: data.pagePath ?? null,
      hotelId: data.hotelId ?? null,
      googleAdsId: data.googleAdsId ?? null,
      conversionLabel: data.conversionLabel ?? null,
      ga4Id: data.ga4Id ?? null,
      note: data.note || null,
    })
    .returning();

  clearAdTagCache();
  await logAudit({
    actor: guard.user,
    action: "reklam_kodu.eklendi",
    entityType: "ad_tag",
    entityId: created!.id,
    meta: { pagePath: created!.pagePath, hotelId: created!.hotelId, googleAdsId: created!.googleAdsId, ga4Id: created!.ga4Id },
  });

  return NextResponse.json({ ok: true, tag: created });
}

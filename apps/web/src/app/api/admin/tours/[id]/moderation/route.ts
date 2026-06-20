// ---------------------------------------------------------------------------
// POST /api/admin/tours/[id]/moderation — tur onay/red
// Onay: taslak adımlardan manifest üretilir → publishedManifest snapshot,
//       version++, status yayinda. Misafir oynatıcı yalnızca snapshot okur.
// Red:  not zorunlu, status reddedildi.
// neon-http transaction desteklemez — snapshot ve status tek UPDATE ile yazılır.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { toursTable } from "@/lib/db/schema";
import { getManifestFromDB } from "@/lib/db/manifest";
import { tourManifestSchema } from "@/lib/schemas/tour-manifest";
import { moderationDecisionSchema } from "@/lib/schemas/hotel-admin";
import { logAudit } from "@/lib/audit";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = moderationDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const [tour] = await db
    .select()
    .from(toursTable)
    .where(eq(toursTable.id, id))
    .limit(1);

  if (!tour) {
    return NextResponse.json({ ok: false, error: "Tur bulunamadı." }, { status: 404 });
  }

  if (tour.status !== "incelemede") {
    return NextResponse.json(
      {
        ok: false,
        error: `Yalnızca incelemedeki turlar onaylanabilir veya reddedilebilir (mevcut: ${tour.status}).`,
      },
      { status: 409 },
    );
  }

  const now = new Date();

  if (parsed.data.karar === "reddet") {
    await db
      .update(toursTable)
      .set({
        status: "reddedildi",
        moderationNote: parsed.data.not!.trim(),
        reviewedAt: now,
        reviewedBy: guard.user.id,
        updatedAt: now,
      })
      .where(eq(toursTable.id, tour.id));

    await logAudit({
      actor: guard.user,
      action: "tur.reddedildi",
      entityType: "tour",
      entityId: tour.id,
      meta: { hotelSlug: tour.hotelSlug, tourId: tour.tourId, not: parsed.data.not },
    });

    return NextResponse.json({ ok: true, status: "reddedildi" });
  }

  // Onay — taslaktan yayın anlık görüntüsü üret
  const draft = await getManifestFromDB(tour.hotelSlug, tour.tourId);
  if (!draft) {
    return NextResponse.json(
      { ok: false, error: "Tur adımları bulunamadı — onaylanamaz." },
      { status: 400 },
    );
  }

  const newVersion = tour.version + 1;
  const manifest = tourManifestSchema.parse({
    ...draft,
    version: newVersion,
    title: tour.title,
  });

  await db
    .update(toursTable)
    .set({
      status: "yayinda",
      publishedManifest: manifest,
      version: newVersion,
      publishedAt: now,
      moderationNote: parsed.data.not?.trim() || null,
      reviewedAt: now,
      reviewedBy: guard.user.id,
      updatedAt: now,
    })
    .where(eq(toursTable.id, tour.id));

  await logAudit({
    actor: guard.user,
    action: "tur.onaylandi",
    entityType: "tour",
    entityId: tour.id,
    meta: {
      hotelSlug: tour.hotelSlug,
      tourId: tour.tourId,
      yeniSurum: newVersion,
      adimSayisi: manifest.steps.length,
    },
  });

  return NextResponse.json({ ok: true, status: "yayinda", version: newVersion });
}

// ---------------------------------------------------------------------------
// GET/PUT /api/manager/hotels/[hotelId]/tours/[tourId]/steps
// GET: taslak adımlar (manifest TourStep biçiminde)
// PUT: toplu kayıt — upsert + listede olmayanları sil
//      (neon-http transaction desteklemez: önce upsert, sonra silme; yarıda
//       kalan kayıt bir sonraki PUT ile düzelir)
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { clearFactCatalogCache } from "@/lib/ai/fact-store";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { tourStepsTable, toursTable } from "@/lib/db/schema";
import { stepsBulkSaveSchema } from "@/lib/schemas/tour-editor";
import type { TourStep } from "@/lib/schemas/tour-manifest";
import { withTransaction } from "@/lib/db/transaction";

type RouteParams = { params: Promise<{ hotelId: string; tourId: string }> };

function rowToManifestStep(s: typeof tourStepsTable.$inferSelect): TourStep {
  return {
    stepId: s.stepId,
    order: s.orderIndex,
    kind: s.kind as TourStep["kind"],
    title: s.title,
    body: s.body ?? undefined,
    requiresUserContinue: s.requiresUserContinue,
    media: {
      mode: s.media.mode,
      src: s.mediaUrl,
      startSec: s.media.startSec,
      endSec: s.media.endSec,
    },
    captionsVttUrl: s.captionsVttUrl ?? undefined,
    narrationUrl: s.narrationUrl ?? undefined,
    branches: s.branches.length > 0 ? s.branches : undefined,
    callouts: s.callouts.length > 0 ? (s.callouts as TourStep["callouts"]) : undefined,
    hotspots: s.hotspots.length > 0 ? s.hotspots : undefined,
    aiTags: s.aiTags.length > 0 ? s.aiTags : undefined,
    aiDescription: s.aiDescription ?? undefined,
    aiPromo: s.aiPromo.length > 0 ? s.aiPromo : undefined,
    aiVisible: s.aiVisible,
  };
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { hotelId, tourId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const db = getDb();
  const rows = await db
    .select()
    .from(tourStepsTable)
    .where(
      and(
        eq(tourStepsTable.hotelSlug, guard.hotel.slug),
        eq(tourStepsTable.tourId, tourId),
      ),
    )
    .orderBy(tourStepsTable.orderIndex);

  return NextResponse.json({ ok: true, steps: rows.map(rowToManifestStep) });
}

export async function PUT(req: Request, { params }: RouteParams) {
  const { hotelId, tourId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = stepsBulkSaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const steps = parsed.data.steps;
  const expectedRevision = parsed.data.expectedRevision;

  // stepId benzersizliği
  const ids = steps.map((s) => s.stepId);
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json(
      { ok: false, error: "Adım kimlikleri (stepId) benzersiz olmalı." },
      { status: 400 },
    );
  }

  // Dal hedefleri listede mevcut olmalı
  const idSet = new Set(ids);
  for (const s of steps) {
    for (const b of s.branches ?? []) {
      if (!idSet.has(b.nextStepId)) {
        return NextResponse.json(
          {
            ok: false,
            error: `"${s.stepId}" adımındaki dal hedefi bulunamadı: "${b.nextStepId}"`,
          },
          { status: 400 },
        );
      }
    }
  }

  // Turun varlığını doğrula
  const db = getDb();
  const [tour] = await db
    .select({ id: toursTable.id })
    .from(toursTable)
    .where(and(eq(toursTable.hotelId, guard.hotel.id), eq(toursTable.tourId, tourId)))
    .limit(1);
  if (!tour) {
    return NextResponse.json({ ok: false, error: "Tur bulunamadı." }, { status: 404 });
  }

  const result = await withTransaction(async (tx) => {
    const [locked] = await tx.select({ id: toursTable.id, draftRevision: toursTable.draftRevision })
      .from(toursTable)
      .where(and(eq(toursTable.id, tour.id), eq(toursTable.draftRevision, expectedRevision)))
      .for("update");
    if (!locked) return null;

    // Upsert — order dizideki sıraya göre yeniden yazılır
    for (const [index, s] of steps.entries()) {
    const row = {
      hotelSlug: guard.hotel.slug,
      tourId,
      stepId: s.stepId,
      title: s.title,
      kind: s.kind,
      orderIndex: index,
      requiresUserContinue: s.requiresUserContinue,
      body: s.body ?? null,
      mediaUrl: s.media.src,
      media: {
        mode: s.media.mode,
        startSec: s.media.startSec,
        endSec: s.media.endSec,
      },
      captionsVttUrl: s.captionsVttUrl ?? null,
      narrationUrl: s.narrationUrl ?? null,
      branches: s.branches ?? [],
      callouts: s.callouts ?? [],
      hotspots: s.hotspots ?? [],
      aiTags: s.aiTags ?? [],
      aiDescription: s.aiDescription ?? null,
      aiPromo: s.aiPromo ?? [],
      aiVisible: s.aiVisible ?? true,
    };

      await tx
      .insert(tourStepsTable)
      .values(row)
      .onConflictDoUpdate({
        target: [tourStepsTable.hotelSlug, tourStepsTable.tourId, tourStepsTable.stepId],
        set: { ...row },
      });
    }

  // Listede olmayan adımları temizle
    await tx
    .delete(tourStepsTable)
    .where(
      and(
        eq(tourStepsTable.hotelSlug, guard.hotel.slug),
        eq(tourStepsTable.tourId, tourId),
        notInArray(tourStepsTable.stepId, ids),
      ),
    );

    const [updatedTour] = await tx
    .update(toursTable)
    .set({ draftRevision: sql`${toursTable.draftRevision} + 1`, updatedAt: new Date() })
    .where(eq(toursTable.id, tour.id))
    .returning();
    return updatedTour;
  });
  if (!result) {
    const [latest] = await db.select({ draftRevision: toursTable.draftRevision }).from(toursTable).where(eq(toursTable.id, tour.id)).limit(1);
    return NextResponse.json({ ok: false, code: "REVISION_CONFLICT", currentRevision: latest?.draftRevision }, { status: 409 });
  }

  clearFactCatalogCache(guard.hotel.slug);

  return NextResponse.json({ ok: true, count: steps.length, draftRevision: expectedRevision + 1 });
}

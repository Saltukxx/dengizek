// ---------------------------------------------------------------------------
// DB'den TourManifest çeken sorgu fonksiyonu
// ---------------------------------------------------------------------------

import { and, eq } from "drizzle-orm";
import {
  safeParseTourManifest,
  tourCalloutPlacementValues,
  type TourCalloutPlacement,
  type TourManifest,
} from "@/lib/schemas/tour-manifest";
import { getDb } from "./index";
import { hotelsTable, tourStepsTable, toursTable } from "./schema";

type DbCallout = {
  id: string;
  tSec: number;
  title: string;
  body?: string;
  placement?: string;
};

const calloutPlacements = new Set<string>(tourCalloutPlacementValues);

function isTourCalloutPlacement(
  value: string | undefined,
): value is TourCalloutPlacement {
  return value !== undefined && calloutPlacements.has(value);
}

function normalizeCallouts(callouts: DbCallout[]) {
  if (callouts.length === 0) return undefined;

  return callouts.map((callout) => ({
    ...callout,
    placement: isTourCalloutPlacement(callout.placement)
      ? callout.placement
      : undefined,
  }));
}

/**
 * YAYIMLANMIŞ manifesti döner — tours.publishedManifest anlık görüntüsü.
 * Misafir oynatıcı ve AI sohbeti yalnızca bunu kullanır; taslak değişiklikler
 * admin onayına kadar misafire yansımaz.
 * Tur yoksa, yayında değilse veya snapshot geçersizse undefined döner.
 */
export async function getPublishedManifest(
  hotelSlug: string,
  tourId: string,
): Promise<TourManifest | undefined> {
  const db = getDb();
  const [tour] = await db
    .select({
      status: toursTable.status,
      publishedManifest: toursTable.publishedManifest,
    })
    .from(toursTable)
    .where(and(eq(toursTable.hotelSlug, hotelSlug), eq(toursTable.tourId, tourId)))
    .limit(1);

  if (!tour || tour.status !== "yayinda" || !tour.publishedManifest) return undefined;

  const parsed = safeParseTourManifest(tour.publishedManifest);
  if (!parsed.success) {
    console.error(
      `[manifest] yayımlanmış manifest geçersiz (${hotelSlug}/${tourId}):`,
      parsed.error.flatten(),
    );
    return undefined;
  }
  return parsed.data;
}

/**
 * TASLAK manifesti döner — tour_steps çalışma kopyasından üretilir.
 * Manager API (önizleme, submit doğrulaması) ve admin onayı (snapshot üretimi)
 * kullanır. Otel veya adım bulunamazsa undefined döner.
 */
export async function getManifestFromDB(
  hotelSlug: string,
  tourId: string,
): Promise<TourManifest | undefined> {
  const db = getDb();

  // 1. Otel profilini çek
  const [hotel] = await db
    .select()
    .from(hotelsTable)
    .where(eq(hotelsTable.slug, hotelSlug))
    .limit(1);

  if (!hotel) return undefined;

  // 2. Tur adımlarını çek (sıralı)
  const steps = await db
    .select()
    .from(tourStepsTable)
    .where(
      and(
        eq(tourStepsTable.hotelSlug, hotelSlug),
        eq(tourStepsTable.tourId, tourId),
      ),
    )
    .orderBy(tourStepsTable.orderIndex);

  if (steps.length === 0) return undefined;

  // 3. TourManifest şekline dönüştür
  return {
    tourId,
    hotelSlug,
    version: 1,
    steps: steps.map((s) => ({
      stepId: s.stepId,
      order: s.orderIndex,
      kind: s.kind as "lobby" | "corridor" | "room" | "amenity_spot",
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
      stepKey: s.stepKey ?? undefined,
      branches: s.branches.length > 0 ? s.branches : undefined,
      callouts: normalizeCallouts(s.callouts),
      hotspots: s.hotspots.length > 0 ? s.hotspots : undefined,
      aiTags: s.aiTags.length > 0 ? s.aiTags : undefined,
      aiDescription: s.aiDescription ?? undefined,
      aiPromo: s.aiPromo.length > 0 ? s.aiPromo : undefined,
      aiVisible: s.aiVisible,
    })),
    hotelProfile: {
      aiPersona: hotel.aiPersona,
      language: hotel.aiLanguage,
      facts: hotel.aiFacts.length > 0 ? hotel.aiFacts : undefined,
      policies: hotel.aiPolicies.length > 0 ? hotel.aiPolicies : undefined,
    },
  };
}

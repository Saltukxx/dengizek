// ---------------------------------------------------------------------------
// Yolculuk analizi için DB okuma — admin ve otel paneli API'leri ortak kullanır.
// ---------------------------------------------------------------------------

import { and, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { analyticsEventsTable, hotelsTable, toursTable } from "@/lib/db/schema";
import {
  JOURNEY_QUERY_EVENT_TYPES,
  summarizeAi,
  summarizeConversion,
  summarizeTours,
  type JourneyEventRow,
  type TourStepMeta,
} from "@/lib/journey-insights";

/** ?period= gün sayısı — 7 ile 90 arası (ham metin 90 gün tutulur). */
export function periodFromUrl(url: URL): { periodDays: number; since: Date } {
  const periodDays = Math.min(90, Math.max(7, Number(url.searchParams.get("period") ?? "30") || 30));
  const since = new Date();
  since.setDate(since.getDate() - periodDays);
  return { periodDays, since };
}

async function loadRows(since: Date, hotelId: string | null): Promise<JourneyEventRow[]> {
  const filters = [
    inArray(analyticsEventsTable.eventType, [...JOURNEY_QUERY_EVENT_TYPES]),
    gte(analyticsEventsTable.createdAt, since),
    isNotNull(analyticsEventsTable.visitId),
  ];
  if (hotelId) filters.push(eq(analyticsEventsTable.hotelId, hotelId));
  return getDb()
    .select({
      eventType: analyticsEventsTable.eventType,
      payload: analyticsEventsTable.payload,
      visitId: analyticsEventsTable.visitId,
      hotelSlug: analyticsEventsTable.hotelSlug,
      createdAt: analyticsEventsTable.createdAt,
    })
    .from(analyticsEventsTable)
    .where(and(...filters));
}

/** Yayındaki tur manifestlerinden adım adları ve sırası. */
async function loadStepMeta(hotelSlugs: string[]): Promise<Map<string, TourStepMeta[]>> {
  const map = new Map<string, TourStepMeta[]>();
  if (hotelSlugs.length === 0) return map;
  const tours = await getDb()
    .select({ hotelSlug: toursTable.hotelSlug, tourId: toursTable.tourId, manifest: toursTable.publishedManifest })
    .from(toursTable)
    .where(inArray(toursTable.hotelSlug, hotelSlugs));
  for (const t of tours) {
    const steps = (t.manifest as { steps?: Array<{ stepId?: unknown; title?: unknown; order?: unknown }> } | null)?.steps ?? [];
    map.set(
      `${t.hotelSlug}::${t.tourId}`,
      steps
        .filter((s) => typeof s.stepId === "string")
        .map((s, i) => ({
          stepId: s.stepId as string,
          title: typeof s.title === "string" ? s.title : (s.stepId as string),
          order: typeof s.order === "number" ? s.order : i,
        })),
    );
  }
  return map;
}

/** Tur, soru → talep ve yapay zekâ özetlerini tek seferde hesaplar. */
export async function loadJourneyInsights(since: Date, hotelId: string | null) {
  const rows = await loadRows(since, hotelId);
  const slugs = [...new Set(rows.map((r) => r.hotelSlug).filter((s): s is string => Boolean(s)))];
  const [stepMeta, hotels] = await Promise.all([
    loadStepMeta(slugs),
    slugs.length
      ? getDb().select({ slug: hotelsTable.slug, name: hotelsTable.name }).from(hotelsTable).where(inArray(hotelsTable.slug, slugs))
      : Promise.resolve([]),
  ]);
  const nameOf = new Map(hotels.map((h) => [h.slug, h.name]));
  return {
    tours: summarizeTours(rows, stepMeta).map((t) => ({ ...t, hotelName: nameOf.get(t.hotelSlug) ?? t.hotelSlug })),
    conversion: summarizeConversion(rows),
    ai: summarizeAi(rows),
  };
}

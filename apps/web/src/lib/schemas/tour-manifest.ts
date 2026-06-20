import { z } from "zod";

export const tourCalloutPlacementValues = [
  "topStart",
  "topEnd",
  "bottomStart",
  "bottomEnd",
  "center",
] as const;
export type TourCalloutPlacement = (typeof tourCalloutPlacementValues)[number];

export const tourCalloutSchema = z.object({
  id: z.string().min(1),
  tSec: z.number().nonnegative(),
  title: z.string().min(1),
  body: z.string().optional(),
  /** Tam ekranda kutu konumu; yoksa bottomStart. */
  placement: z.enum(tourCalloutPlacementValues).optional(),
});

export const tourHotspotSchema = z.object({
  id: z.string().min(1),
  xPct: z.number().min(0).max(100),
  yPct: z.number().min(0).max(100),
  label: z.string().min(1),
  body: z.string().optional(),
  /** Bu saniyeden sonra goster; yoksa adim boyunca. */
  tSec: z.number().nonnegative().optional(),
});

export const tourStepBranchSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  nextStepId: z.string().min(1),
});

// ---------------------------------------------------------------------------
// AI Rehber -- otel profili (manifest kokunde, opsiyonel)
// ---------------------------------------------------------------------------

export const hotelProfileSchema = z.object({
  /** Rehberin kullaniciya tanitacagi isim. */
  aiPersona: z.string().min(1),
  /** Varsayilan sohbet dili (BCP-47). */
  language: z.string().min(1).default("tr"),
  /** Kisa otel gercekleri -- AI bu listeden disari cikmaz. */
  facts: z.array(z.string()).optional(),
  /** Politikalar -- check-in saati, iptal kosullari vb. */
  policies: z.array(z.string()).optional(),
});

export type HotelProfile = z.infer<typeof hotelProfileSchema>;

// ---------------------------------------------------------------------------
// TourStep
// ---------------------------------------------------------------------------

/** Mirrors parent plan TourStep / manifest contract (Zod for runtime + TypeScript). */
export const tourStepSchema = z.object({
  stepId: z.string().min(1),
  order: z.number().int().nonnegative(),
  kind: z.enum(["lobby", "corridor", "room", "amenity_spot"]),
  title: z.string().min(1),
  body: z.string().optional(),
  requiresUserContinue: z.boolean(),
  media: z.object({
    mode: z.enum(["clip", "window"]),
    /** HTTPS URL or app-relative path e.g. /demo/clip1.mp4 */
    src: z.string().min(1),
    startSec: z.number().nonnegative().optional(),
    endSec: z.number().nonnegative().optional(),
  }),
  captionsVttUrl: z.string().min(1).optional(),
  narrationUrl: z.string().min(1).optional(),
  callouts: z.array(tourCalloutSchema).optional(),
  hotspots: z.array(tourHotspotSchema).optional(),
  /** Doluysa etkilesimde tek "Devam" yerine yol secimi (dallanma). */
  branches: z.array(tourStepBranchSchema).min(1).optional(),

  // -------------------------------------------------------------------------
  // AI Rehber metadata -- tumü opsiyonel, geriye uyumlu
  // -------------------------------------------------------------------------

  /**
   * Cok dilli anahtar kelimeler. AI bu listeyi kullanici niyetini adimla
   * eslestirmek icin kullanir. Sinonim ve farkli dilleri ekleyin.
   * Ornek: ["sahil", "plaj", "deniz", "beach", "kumsal"]
   */
  aiTags: z.array(z.string()).optional(),

  /**
   * AI'in bu alani anlatmak icin kullanacagi kisa metin. System prompt'a
   * eklenir; kullaniciya birebir okunmaz, bagiam olarak kullanilir.
   */
  aiDescription: z.string().optional(),

  /**
   * Bu adimda one cikarilacak satis noktalari. AI dogal konusma sirasinda
   * bunlardan yararlanir.
   */
  aiPromo: z.array(z.string()).optional(),

  /**
   * false ise AI bu adimi onermez ve otomatik turda atlar.
   * Belirtilmezse true kabul edilir.
   */
  aiVisible: z.boolean().optional(),
});

export const tourManifestSchema = z.object({
  tourId: z.string().min(1),
  hotelSlug: z.string().min(1),
  roomSlug: z.string().min(1).optional(),
  version: z.number().int().positive(),
  title: z.string().min(1).optional(),
  steps: z.array(tourStepSchema).min(1),
  /** AI Rehber icin otel profili. */
  hotelProfile: hotelProfileSchema.optional(),
});

export type TourCallout = z.infer<typeof tourCalloutSchema>;
export type TourHotspot = z.infer<typeof tourHotspotSchema>;
export type TourStepBranch = z.infer<typeof tourStepBranchSchema>;
export type TourStep = z.infer<typeof tourStepSchema>;
export type TourManifest = z.infer<typeof tourManifestSchema>;

export function parseTourManifest(data: unknown): TourManifest {
  return tourManifestSchema.parse(data);
}

export function safeParseTourManifest(
  data: unknown,
):
  | { success: true; data: TourManifest }
  | { success: false; error: z.ZodError } {
  const r = tourManifestSchema.safeParse(data);
  if (r.success) return { success: true, data: r.data };
  return { success: false, error: r.error };
}

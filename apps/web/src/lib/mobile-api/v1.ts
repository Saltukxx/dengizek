// ---------------------------------------------------------------------------
// iOS uygulaması için sürümlü okuma API'si (v1) — yanıt biçimleri.
//
// Uygulama iç tipleri (BrowseHotelRow, PublishedHotelContent) doğrudan görmez:
// buradaki eşleme sabit bir sözleşme verir, iç alan eklense/değişse de
// yayındaki uygulama bozulmaz. Alan kaldırmak/anlamını değiştirmek = v2.
// ---------------------------------------------------------------------------

import { amenityLabel, highlightAmenityKeys } from "@/lib/amenities-catalog";
import type { BrowseHotelRow, PublishedHotelContent, PublishedTourSummary } from "@/lib/hotels-repo";
import type { HotelMock } from "@/lib/mocks/hotels";
import type { TourManifest } from "@/lib/schemas/tour-manifest";

export const MOBILE_SEASONS = ["termal", "yaz", "kis"] as const;
export type MobileSeason = (typeof MOBILE_SEASONS)[number];

export function parseMobileSeason(value: string | null): MobileSeason | undefined {
  return MOBILE_SEASONS.find((s) => s === value);
}

export interface MobilePrice {
  amountMinor: number;
  currency: string;
  /** Doluysa fiyat bu geceden itibaren geçerli (YYYY-MM-DD); boşsa bugün geçerli. */
  fromDate: string | null;
}

export interface MobileHotelCard {
  slug: string;
  name: string;
  city: string | null;
  country: string | null;
  shortDescription: string | null;
  imageUrl: string | null;
  starRating: number | null;
  seasons: string[];
  price: MobilePrice | null;
  promotionBadge: string | null;
  reviewAverage: number | null;
  reviewCount: number;
  tourId: string | null;
  /** Kartta gösterilen öne çıkan olanaklar (web kartıyla aynı seçim, en fazla 3). */
  highlights: string[];
}

export interface MobileRoom {
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  sizeSqm: number | null;
  capacityAdults: number;
  capacityChildren: number;
  bedConfig: string | null;
  viewType: string | null;
  boardType: string;
  imageUrl: string | null;
  galleryUrls: string[];
  amenities: string[];
}

export interface MobileHotelDetail {
  slug: string;
  name: string;
  city: string | null;
  country: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  imageUrl: string | null;
  starRating: number | null;
  amenities: string[];
  gallery: { url: string; caption: string | null }[];
  rooms: MobileRoom[];
  tours: { tourId: string; title: string; roomSlug: string | null }[];
  location: { latitude: number; longitude: number; address: string | null } | null;
  policies: {
    checkInTime: string | null;
    checkOutTime: string | null;
    cancellationPolicy: string | null;
    childPolicy: string | null;
    petsAllowed: boolean | null;
  };
  contact: { phone: string | null; whatsapp: string | null };
}

function cardPrice(row: BrowseHotelRow): MobilePrice | null {
  if (row.minPriceMinor != null) return { amountMinor: row.minPriceMinor, currency: "TRY", fromDate: null };
  if (row.upcomingPrice) {
    return {
      amountMinor: row.upcomingPrice.priceMinor,
      currency: row.upcomingPrice.currency,
      fromDate: row.upcomingPrice.fromDate,
    };
  }
  return null;
}

export function toMobileHotelCard(row: BrowseHotelRow): MobileHotelCard {
  return {
    slug: row.slug,
    name: row.name,
    city: row.city ?? null,
    country: row.country ?? null,
    shortDescription: row.shortDescription ?? null,
    imageUrl: row.imageUrl || null,
    starRating: row.starRating ?? null,
    seasons: row.seasons ?? [],
    price: cardPrice(row),
    promotionBadge: row.promotionBadge ?? null,
    reviewAverage: row.reviewAverage ?? null,
    reviewCount: row.reviewCount ?? 0,
    tourId: row.tourId ?? null,
    highlights: highlightAmenityKeys(row.amenities ?? [], 3).map(amenityLabel),
  };
}

function toNumber(value: string | null): number | null {
  if (value == null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function toMobileHotelDetail(
  hotel: HotelMock,
  content: PublishedHotelContent,
  tours: PublishedTourSummary[],
  card?: Pick<BrowseHotelRow, "starRating"> | null,
): MobileHotelDetail {
  const lat = toNumber(content.latitude);
  const lng = toNumber(content.longitude);
  return {
    slug: hotel.slug,
    name: content.name || hotel.name,
    city: hotel.city || null,
    country: hotel.country || null,
    shortDescription: hotel.shortDescription || null,
    longDescription: hotel.longDescription || null,
    imageUrl: hotel.imageUrl || null,
    starRating: content.specs.starRating ?? card?.starRating ?? null,
    amenities: content.amenities.map(amenityLabel),
    gallery: content.gallery,
    rooms: content.rooms.map((r) => ({
      slug: r.slug,
      name: r.name,
      tagline: r.tagline ?? null,
      description: r.description ?? null,
      sizeSqm: r.sizeSqm ?? null,
      capacityAdults: r.capacityAdults,
      capacityChildren: r.capacityChildren,
      bedConfig: r.bedConfig ?? null,
      viewType: r.viewType ?? null,
      boardType: r.boardType,
      imageUrl: r.imageUrl ?? null,
      galleryUrls: r.galleryUrls ?? [],
      amenities: r.amenities ?? [],
    })),
    tours: tours.map((t) => ({ tourId: t.tourId, title: t.title, roomSlug: t.roomSlug })),
    location: lat != null && lng != null ? { latitude: lat, longitude: lng, address: content.specs.address } : null,
    policies: {
      checkInTime: content.specs.checkInTime,
      checkOutTime: content.specs.checkOutTime,
      cancellationPolicy: content.specs.cancellationPolicy,
      childPolicy: content.specs.childPolicy,
      petsAllowed: content.specs.petsAllowed,
    },
    contact: { phone: content.specs.publicPhone ?? null, whatsapp: content.specs.whatsappPhone ?? null },
  };
}

export interface MobileTourStep {
  stepId: string;
  kind: string;
  title: string;
  body: string | null;
  requiresUserContinue: boolean;
  /** clip: adımın kendi videosu; window: ortak videonun startSec–endSec aralığı. */
  media: { mode: "clip" | "window"; src: string; startSec: number | null; endSec: number | null };
  captionsVttUrl: string | null;
  callouts: { id: string; tSec: number; title: string; body: string | null }[];
  branches: { id: string; label: string; nextStepId: string }[];
}

export interface MobileTour {
  tourId: string;
  hotelSlug: string;
  title: string | null;
  version: number;
  /** İmzalı video adreslerinin bitişi (UNIX sn); boşsa adresler süresiz. */
  mediaTokenExpiresAt: number | null;
  steps: MobileTourStep[];
}

/** Adımlar sıralı gelir; AI alanları ve otel profili uygulamaya taşınmaz. */
export function toMobileTour(manifest: TourManifest): MobileTour {
  return {
    tourId: manifest.tourId,
    hotelSlug: manifest.hotelSlug,
    title: manifest.title ?? null,
    version: manifest.version,
    mediaTokenExpiresAt: manifest.mediaTokenExpiresAt ?? null,
    steps: [...manifest.steps]
      .sort((a, b) => a.order - b.order)
      .map((step) => ({
        stepId: step.stepId,
        kind: step.kind,
        title: step.title,
        body: step.body ?? null,
        requiresUserContinue: step.requiresUserContinue,
        media: {
          mode: step.media.mode,
          src: step.media.src,
          startSec: step.media.startSec ?? null,
          endSec: step.media.endSec ?? null,
        },
        captionsVttUrl: step.captionsVttUrl ?? null,
        callouts: (step.callouts ?? []).map((c) => ({ id: c.id, tSec: c.tSec, title: c.title, body: c.body ?? null })),
        branches: (step.branches ?? []).map((b) => ({ id: b.id, label: b.label, nextStepId: b.nextStepId })),
      })),
  };
}

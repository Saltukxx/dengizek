// ---------------------------------------------------------------------------
// Otel listesi süzgeci — web vitrini (hotel-browse) ve iOS API'si (v1/hotels)
// aynı kuralla süzer. DB'ye dokunmaz; metin araması SQL'de yapıldıktan sonra
// kalan filtreler önbellekteki liste satırları üzerinde uygulanır.
// ---------------------------------------------------------------------------

import { normalizeAmenities } from "@/lib/amenities-catalog";
import type { BrowseHotelRow } from "@/lib/hotels-repo";
import { overlapsClosedRange, roomCapacityFit, type StaySearch } from "@/lib/stay-search";

export const PRICE_BAND_VALUES = ["budget", "mid", "luxury"] as const;
export type PriceBand = (typeof PRICE_BAND_VALUES)[number];
export const SORT_VALUES = ["recommended", "price-asc", "rating-desc"] as const;
export type BrowseSort = (typeof SORT_VALUES)[number];

export interface BrowseFilters {
  /** Küçük harfli arama metni. */
  q?: string;
  minStars?: number;
  amenity?: string;
  petsOnly?: boolean;
  priceBand?: string;
  tourOnly?: boolean;
  promoOnly?: boolean;
  sort?: string;
  stay?: StaySearch;
}

export function filterBrowseHotels(rows: BrowseHotelRow[], f: BrowseFilters): BrowseHotelRow[] {
  let hotels = rows;
  const q = f.q?.trim().toLowerCase();
  if (q) {
    hotels = hotels.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        (h.city ?? "").toLowerCase().includes(q) ||
        (h.country ?? "").toLowerCase().includes(q),
    );
  }
  if (f.minStars && f.minStars >= 1) {
    const min = f.minStars;
    hotels = hotels.filter((h) => (h.starRating ?? 0) >= min);
  }
  if (f.amenity) {
    // Aktarılan tesisler olanakları serbest metinle tutar; filtre anahtar üzerinden çalışır.
    const key = f.amenity;
    hotels = hotels.filter((h) => normalizeAmenities(h.amenities).includes(key));
  }
  if (f.tourOnly) hotels = hotels.filter((h) => h.tourId);
  if (f.promoOnly) hotels = hotels.filter((h) => h.promotionBadge);
  if (f.petsOnly) hotels = hotels.filter((h) => h.petsAllowed === true);

  const stay = f.stay;
  // Kişi sayısı: en az bir odası bu grubu alabilen tesisler kalır. Oda
  // kapasitesi bilinmeyen tesis elenmez (otel talepte teyit eder).
  if (stay?.hasParty) {
    hotels = hotels.filter(
      (h) => !h.roomCapacities?.length || h.roomCapacities.some((room) => roomCapacityFit(room, stay) !== "no"),
    );
  }
  // Tarih: otelin kapalı dönemine denk gelen konaklamalar elenir.
  if (stay?.checkIn && stay.checkOut) {
    const { checkIn, checkOut } = stay;
    hotels = hotels.filter((h) => !overlapsClosedRange(checkIn, checkOut, h.closedRanges ?? []));
  }

  if (f.priceBand === "budget") {
    hotels = hotels.filter((h) => h.minPriceMinor != null && h.minPriceMinor < 300_000);
  } else if (f.priceBand === "mid") {
    hotels = hotels.filter((h) => h.minPriceMinor != null && h.minPriceMinor >= 300_000 && h.minPriceMinor < 800_000);
  } else if (f.priceBand === "luxury") {
    hotels = hotels.filter((h) => h.minPriceMinor != null && h.minPriceMinor >= 800_000);
  }

  const sort = f.sort ?? "recommended";
  if (sort === "recommended") {
    // Önerilen: video turu olanlar önce (stabil sıralama, alfabetik sıra korunur).
    hotels = [...hotels].sort((a, b) => Number(Boolean(b.tourId)) - Number(Boolean(a.tourId)));
  } else if (sort === "price-asc") {
    hotels = [...hotels].sort(
      (a, b) => (a.minPriceMinor ?? Number.MAX_SAFE_INTEGER) - (b.minPriceMinor ?? Number.MAX_SAFE_INTEGER),
    );
  } else if (sort === "rating-desc") {
    hotels = [...hotels].sort((a, b) => (b.reviewAverage ?? 0) - (a.reviewAverage ?? 0));
  }
  return hotels;
}

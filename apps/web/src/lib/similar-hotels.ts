// ---------------------------------------------------------------------------
// Benzer oteller — otel sayfasının altında. Aynı vitrindeki tesisler arasından
// önce aynı il, sonra ortak olanak sayısı, sonra video turu ve yıldız yakınlığı.
// ---------------------------------------------------------------------------

import { normalizeAmenities } from "@/lib/amenities-catalog";
import { normalizeProvince } from "@/lib/guest-city-groups";
import type { BrowseHotelRow } from "@/lib/hotels-repo";

export const SIMILAR_HOTEL_COUNT = 4;

function province(city: string | null): string {
  return (normalizeProvince(city) ?? "").toLocaleLowerCase("tr-TR");
}

export function pickSimilarHotels(
  hotels: BrowseHotelRow[],
  currentSlug: string,
  limit: number = SIMILAR_HOTEL_COUNT,
): BrowseHotelRow[] {
  const current = hotels.find((h) => h.slug === currentSlug);
  const others = hotels.filter((h) => h.slug !== currentSlug);
  if (!current) return others.slice(0, limit);

  const here = province(current.city);
  const amenities = new Set(normalizeAmenities(current.amenities));
  const score = (h: BrowseHotelRow) => {
    const sameProvince = here && province(h.city) === here ? 1 : 0;
    const shared = normalizeAmenities(h.amenities).filter((a) => amenities.has(a)).length;
    const starGap = current.starRating && h.starRating ? Math.abs(current.starRating - h.starRating) : 2;
    return sameProvince * 1000 + shared * 10 + (h.tourId ? 5 : 0) - starGap;
  };

  return others
    .map((h) => ({ h, s: score(h) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ h }) => h);
}

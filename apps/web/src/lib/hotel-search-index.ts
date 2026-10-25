// ---------------------------------------------------------------------------
// Otel arama asistanının indeksi — yayındaki tüm otellerin olanakları, odaları,
// metinleri. Misafire görünen veriden (publishedSnapshot) kurulur.
// Önbellek kısa (5 dk): yeni yayınlanan otel en geç 5 dakikada aranabilir olur.
// ---------------------------------------------------------------------------

import { airportDistanceFromTexts, type SearchIndexHotel } from "@/lib/ai/hotel-search";
import { buildFactCatalog } from "@/lib/ai/fact-store";
import { getHotelAiProfile } from "@/lib/db/ai-context";
import { getPublishedHotelContent, getPublishedHotelsForBrowse } from "@/lib/hotels-repo";

const INDEX_TTL_MS = 5 * 60 * 1000;
let cached: { at: number; data: Promise<SearchIndexHotel[]> } | null = null;

async function buildIndex(): Promise<SearchIndexHotel[]> {
  const hotels = await getPublishedHotelsForBrowse();
  return Promise.all(
    hotels.map(async (hotel) => {
      const [content, profile] = await Promise.all([getPublishedHotelContent(hotel.slug), getHotelAiProfile(hotel.slug)]);
      const catalog = await buildFactCatalog(hotel.slug, { profile, content });
      const texts = catalog.filter((e) => e.id.startsWith("statement.") || e.id.startsWith("policy.")).map((e) => `${e.title ?? ""} ${e.text}`);
      const amenities = catalog.find((e) => e.id === "spec.amenities")?.items ?? content.amenities;
      return {
        slug: hotel.slug,
        name: hotel.name,
        city: hotel.city,
        address: content.specs.address,
        imageUrl: hotel.imageUrl,
        starRating: hotel.starRating,
        amenities,
        petsAllowed: content.specs.petsAllowed,
        rooms: content.rooms.map((r) => ({
          name: r.name,
          capacityAdults: r.capacityAdults,
          capacityChildren: r.capacityChildren ?? 0,
          boardType: r.boardType ?? null,
        })),
        texts,
        airportKm: content.specs.airportDistanceKm ?? airportDistanceFromTexts(texts),
      };
    }),
  );
}

export function getHotelSearchIndex(): Promise<SearchIndexHotel[]> {
  if (!cached || Date.now() - cached.at > INDEX_TTL_MS) {
    const data = buildIndex();
    cached = { at: Date.now(), data };
    // Hata önbellekte kalmasın.
    data.catch(() => {
      if (cached?.data === data) cached = null;
    });
  }
  return cached.data;
}

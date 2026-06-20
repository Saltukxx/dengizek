import { parseTourManifest, type TourManifest } from "@/lib/schemas/tour-manifest";
import rawDemoTour from "@/lib/mocks/demo-tour.json";

let demoAureliaLobbyCache: TourManifest | null = null;

function getDemoAureliaLobby(): TourManifest {
  if (demoAureliaLobbyCache) return demoAureliaLobbyCache;
  demoAureliaLobbyCache = parseTourManifest(rawDemoTour);
  return demoAureliaLobbyCache;
}

export type RoomMock = {
  slug: string;
  name: string;
  description: string;
  tagline: string;
};

export type HotelMock = {
  slug: string;
  name: string;
  city: string;
  country: string;
  shortDescription: string;
  longDescription: string;
  imageUrl: string;
  /** Örn. "gece · talep üzerine" */
  priceLabel?: string;
  roomTypes: RoomMock[];
};

const hotels: HotelMock[] = [
  {
    slug: "aurelia-bay",
    name: "Aurelia Bay Otel",
    city: "Dubrovnik",
    country: "Hırvatistan",
    shortDescription: "Teras havuzu ve Adriyatik manzarası.",
    longDescription:
      "Sakin bir lobi, spa erişimi ve süitlerde gün ışığını içeri alan geniş camlar. Bu demo mülk, etkileşimli video tur deneyimimizi sergiliyor.",
    imageUrl:
      "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=80",
    priceLabel: "Talep üzerine",
    roomTypes: [
      {
        slug: "seaview-deluxe",
        name: "Deniz Manzaralı Deluxe",
        tagline: "32 m² — yatak odası, balkon",
        description:
          "Nötr tonlar, yağmur duşu ve deniz esintisine açılan balkon.",
      },
      {
        slug: "courtyard-quiet",
        name: "Avlu Sessiz",
        tagline: "28 m² — avlu manzarası",
        description: "Daha sakin avlu manzarası; uzun konaklamalar için ideal.",
      },
    ],
  },
  {
    slug: "urban-line",
    name: "Urban Line",
    city: "Lizbon",
    country: "Portekiz",
    shortDescription: "Nehre yakın, tasarım odaklı odalar.",
    longDescription:
      "Parlak bir lobi, ortak çalışma alanı ve sahil hattına hızlı erişimle kompakt, verimli bir konaklama.",
    imageUrl:
      "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1200&q=80",
    priceLabel: "Talep üzerine",
    roomTypes: [
      {
        slug: "river-studio",
        name: "Nehir Stüdyosu",
        tagline: "24 m² — çalışma köşesi",
        description: "Küçük mutfak köşesiyle hafta sonu çalışmaya uygun.",
      },
    ],
  },
];

export function getHotels() {
  return hotels;
}

export function getHotelBySlug(slug: string): HotelMock | undefined {
  return hotels.find((h) => h.slug === slug);
}

export function getRoomBySlugs(
  hotelSlug: string,
  roomSlug: string,
): { hotel: HotelMock; room: RoomMock } | undefined {
  const hotel = getHotelBySlug(hotelSlug);
  if (!hotel) return undefined;
  const room = hotel.roomTypes.find((r) => r.slug === roomSlug);
  if (!room) return undefined;
  return { hotel, room };
}

/** Demo manifest (API ile değiştirilecek). Yalnızca aurelia-bay + demo-lobby. */
export function getDemoTourManifest(
  hotelSlug: string,
  tourId: string,
) {
  if (hotelSlug === "aurelia-bay" && tourId === "demo-lobby") {
    return getDemoAureliaLobby();
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Manifest çözücü: DB-önce, mock-fallback
// ---------------------------------------------------------------------------

/**
 * hotelSlug + tourId için MİSAFİR manifesti döner.
 * - DATABASE_URL tanımlıysa → yalnızca YAYIMLANMIŞ snapshot (tours.publishedManifest)
 * - DATABASE_URL yoksa → demo JSON mock'a düşer (local geliştirme)
 * Taslak adımlar misafire asla gösterilmez — yayın admin onayıyla olur.
 */
export async function getTourManifest(
  hotelSlug: string,
  tourId: string,
): Promise<TourManifest | undefined> {
  // DB varsa yalnızca yayımlanmış sürüm
  if (process.env.DATABASE_URL) {
    try {
      const { getPublishedManifest } = await import("@/lib/db/manifest");
      return await getPublishedManifest(hotelSlug, tourId);
    } catch (err) {
      // DB bağlantı hatası — mock'a düş, logla
      console.warn("[hotels] DB manifest sorgusu başarısız, mock'a düşülüyor:", err);
    }
  }
  // Fallback: statik mock (sadece aurelia-bay/demo-lobby)
  return getDemoTourManifest(hotelSlug, tourId);
}

// ---------------------------------------------------------------------------
// Misafir tarafı otel deposu — DB-önce (yalnızca status = 'yayinda'),
// DB yoksa/hata varsa mock'a düşer. Misafir sayfaları HotelMock şekli bekler;
// DB satırları bu şekle eşlenir.
// ---------------------------------------------------------------------------

import {
  getHotelBySlug as getMockHotelBySlug,
  getHotels as getMockHotels,
  getRoomBySlugs as getMockRoomBySlugs,
  type HotelMock,
} from "@/lib/mocks/hotels";
import type { Extra, Restaurant, Room, RoomRate } from "@/lib/db/schema";

function isDbAvailable(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** DB satırını misafir sayfalarının beklediği HotelMock şekline eşler. */
function toGuestHotel(row: {
  slug: string;
  name: string;
  city: string | null;
  country: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  imageUrl: string | null;
  priceLabel: string | null;
}): HotelMock {
  // Oda tipleri henüz DB'de modellenmedi — mock'ta varsa oradan tamamlanır
  const mock = getMockHotelBySlug(row.slug);
  return {
    slug: row.slug,
    name: row.name,
    city: row.city ?? "",
    country: row.country ?? "",
    shortDescription: row.shortDescription ?? "",
    longDescription: row.longDescription ?? "",
    imageUrl: row.imageUrl ?? "",
    priceLabel: row.priceLabel ?? undefined,
    roomTypes: mock?.roomTypes ?? [],
  };
}

/** Yayında olan otelleri döner (misafir /browse). */
export async function getPublishedHotels(): Promise<HotelMock[]> {
  const rows = await getPublishedHotelsForBrowse();
  return rows.map((row) => {
    const mock = getMockHotelBySlug(row.slug);
    return {
      slug: row.slug,
      name: row.name,
      city: row.city ?? "",
      country: row.country ?? "",
      shortDescription: row.shortDescription ?? "",
      longDescription: row.longDescription ?? "",
      imageUrl: row.imageUrl ?? "",
      priceLabel: row.priceLabel ?? undefined,
      roomTypes: mock?.roomTypes ?? [],
    };
  });
}

export interface BrowseHotelRow {
  slug: string;
  name: string;
  city: string | null;
  country: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  imageUrl: string | null;
  priceLabel: string | null;
  starRating: number | null;
  amenities: string[];
  petsAllowed: boolean | null;
  minPriceMinor: number | null;
}

/** Browse filtreleri için genişletilmiş otel listesi. */
export async function getPublishedHotelsForBrowse(): Promise<BrowseHotelRow[]> {
  if (isDbAvailable()) {
    try {
      const { getDb } = await import("@/lib/db");
      const { hotelsTable, roomsTable } = await import("@/lib/db/schema");
      const { eq, sql, and } = await import("drizzle-orm");
      return await getDb()
        .select({
          slug: hotelsTable.slug,
          name: hotelsTable.name,
          city: hotelsTable.city,
          country: hotelsTable.country,
          shortDescription: hotelsTable.shortDescription,
          longDescription: hotelsTable.longDescription,
          imageUrl: hotelsTable.imageUrl,
          priceLabel: hotelsTable.priceLabel,
          starRating: hotelsTable.starRating,
          amenities: hotelsTable.amenities,
          petsAllowed: hotelsTable.petsAllowed,
          minPriceMinor: sql<number | null>`(
            SELECT min(${roomsTable.priceMinor})
            FROM ${roomsTable}
            WHERE ${roomsTable.hotelId} = ${hotelsTable.id}
              AND ${roomsTable.isActive} = true
              AND ${roomsTable.priceOnRequest} = false
              AND ${roomsTable.priceMinor} IS NOT NULL
          )`.as("min_price_minor"),
        })
        .from(hotelsTable)
        .where(eq(hotelsTable.status, "yayinda"))
        .orderBy(hotelsTable.name);
    } catch (err) {
      console.warn("[hotels-repo] DB sorgusu başarısız, mock'a düşülüyor:", err);
    }
  }
  return getMockHotels().map((h) => ({
    slug: h.slug,
    name: h.name,
    city: h.city,
    country: h.country,
    shortDescription: h.shortDescription,
    longDescription: h.longDescription,
    imageUrl: h.imageUrl,
    priceLabel: h.priceLabel ?? null,
    starRating: null,
    amenities: [] as string[],
    petsAllowed: null,
    minPriceMinor: null,
  }));
}

/** Yayında olan tek oteli döner (misafir /hotels/[slug]). */
export async function getPublishedHotelBySlug(
  slug: string,
): Promise<HotelMock | undefined> {
  if (isDbAvailable()) {
    try {
      const { getDb } = await import("@/lib/db");
      const { hotelsTable } = await import("@/lib/db/schema");
      const { and, eq } = await import("drizzle-orm");
      const [row] = await getDb()
        .select()
        .from(hotelsTable)
        .where(and(eq(hotelsTable.slug, slug), eq(hotelsTable.status, "yayinda")))
        .limit(1);
      return row ? toGuestHotel(row) : undefined;
    } catch (err) {
      console.warn("[hotels-repo] DB sorgusu başarısız, mock'a düşülüyor:", err);
    }
  }
  return getMockHotelBySlug(slug);
}

// ---------------------------------------------------------------------------
// Yayınlanmış otel içeriği — odalar, restoranlar, ekstralar, özellikler
// ---------------------------------------------------------------------------

export interface HotelSpecs {
  starRating: number | null;
  totalRooms: number | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  cancellationPolicy: string | null;
  childPolicy: string | null;
  petsAllowed: boolean | null;
  paymentMethods: string[];
  address: string | null;
  phone: string | null;
  contactEmail: string | null;
  airportDistanceKm: number | null;
  blackoutText: string | null;
}

export interface GuestAvailabilityNote {
  label: string;
  startDate: string | null;
  endDate: string | null;
  isBlackout: boolean;
}

export type RoomWithRates = Room & { rates: RoomRate[] };

export interface PublishedHotelContent {
  rooms: RoomWithRates[];
  restaurants: Restaurant[];
  extras: Extra[];
  amenities: string[];
  specs: HotelSpecs;
  gallery: { url: string; caption: string | null }[];
  latitude: string | null;
  longitude: string | null;
  availabilityNotes: GuestAvailabilityNote[];
}

const emptySpecs: HotelSpecs = {
  starRating: null,
  totalRooms: null,
  checkInTime: null,
  checkOutTime: null,
  cancellationPolicy: null,
  childPolicy: null,
  petsAllowed: null,
  paymentMethods: [],
  address: null,
  phone: null,
  contactEmail: null,
  airportDistanceKm: null,
  blackoutText: null,
};

const emptyContent: PublishedHotelContent = {
  rooms: [],
  restaurants: [],
  extras: [],
  amenities: [],
  specs: emptySpecs,
  gallery: [],
  latitude: null,
  longitude: null,
  availabilityNotes: [],
};

/**
 * Yayında olan otelin misafir içeriğini döner (yalnızca isActive, sıralı).
 * DB yoksa veya otel yayında değilse boş içerik döner — sayfalar mock'la
 * çalışmaya devam eder.
 */
export async function getPublishedHotelContent(
  slug: string,
): Promise<PublishedHotelContent> {
  if (!isDbAvailable()) return emptyContent;
  try {
    const { getDb } = await import("@/lib/db");
    const { hotelsTable, roomsTable, roomRatesTable, restaurantsTable, extrasTable, hotelGalleryImagesTable, hotelAvailabilityNotesTable } =
      await import("@/lib/db/schema");
    const { and, asc, eq } = await import("drizzle-orm");
    const db = getDb();

    const [hotel] = await db
      .select({
        id: hotelsTable.id,
        starRating: hotelsTable.starRating,
        totalRooms: hotelsTable.totalRooms,
        checkInTime: hotelsTable.checkInTime,
        checkOutTime: hotelsTable.checkOutTime,
        amenities: hotelsTable.amenities,
        cancellationPolicy: hotelsTable.cancellationPolicy,
        childPolicy: hotelsTable.childPolicy,
        petsAllowed: hotelsTable.petsAllowed,
        paymentMethods: hotelsTable.paymentMethods,
        address: hotelsTable.address,
        phone: hotelsTable.phone,
        contactEmail: hotelsTable.contactEmail,
        airportDistanceKm: hotelsTable.airportDistanceKm,
        blackoutText: hotelsTable.blackoutText,
        latitude: hotelsTable.latitude,
        longitude: hotelsTable.longitude,
      })
      .from(hotelsTable)
      .where(and(eq(hotelsTable.slug, slug), eq(hotelsTable.status, "yayinda")))
      .limit(1);
    if (!hotel) return emptyContent;

    const [rooms, rates, restaurants, extras, gallery, availabilityNotes] = await Promise.all([
      db
        .select()
        .from(roomsTable)
        .where(and(eq(roomsTable.hotelId, hotel.id), eq(roomsTable.isActive, true)))
        .orderBy(asc(roomsTable.orderIndex), asc(roomsTable.createdAt)),
      db
        .select()
        .from(roomRatesTable)
        .where(eq(roomRatesTable.hotelId, hotel.id))
        .orderBy(asc(roomRatesTable.startDate)),
      db
        .select()
        .from(restaurantsTable)
        .where(
          and(eq(restaurantsTable.hotelId, hotel.id), eq(restaurantsTable.isActive, true)),
        )
        .orderBy(asc(restaurantsTable.orderIndex), asc(restaurantsTable.createdAt)),
      db
        .select()
        .from(extrasTable)
        .where(and(eq(extrasTable.hotelId, hotel.id), eq(extrasTable.isActive, true)))
        .orderBy(asc(extrasTable.orderIndex), asc(extrasTable.createdAt)),
      db
        .select({ url: hotelGalleryImagesTable.url, caption: hotelGalleryImagesTable.caption })
        .from(hotelGalleryImagesTable)
        .where(eq(hotelGalleryImagesTable.hotelId, hotel.id))
        .orderBy(asc(hotelGalleryImagesTable.sortOrder)),
      db
        .select({
          label: hotelAvailabilityNotesTable.label,
          startDate: hotelAvailabilityNotesTable.startDate,
          endDate: hotelAvailabilityNotesTable.endDate,
          isBlackout: hotelAvailabilityNotesTable.isBlackout,
        })
        .from(hotelAvailabilityNotesTable)
        .where(eq(hotelAvailabilityNotesTable.hotelId, hotel.id))
        .orderBy(asc(hotelAvailabilityNotesTable.createdAt)),
    ]);

    const ratesByRoom = new Map<string, RoomRate[]>();
    for (const rate of rates) {
      const list = ratesByRoom.get(rate.roomId) ?? [];
      list.push(rate);
      ratesByRoom.set(rate.roomId, list);
    }

    return {
      rooms: rooms.map((r) => ({ ...r, rates: ratesByRoom.get(r.id) ?? [] })),
      restaurants,
      extras,
      amenities: hotel.amenities,
      gallery,
      specs: {
        starRating: hotel.starRating,
        totalRooms: hotel.totalRooms,
        checkInTime: hotel.checkInTime,
        checkOutTime: hotel.checkOutTime,
        cancellationPolicy: hotel.cancellationPolicy,
        childPolicy: hotel.childPolicy,
        petsAllowed: hotel.petsAllowed,
        paymentMethods: hotel.paymentMethods,
        address: hotel.address,
        phone: hotel.phone,
        contactEmail: hotel.contactEmail,
        airportDistanceKm: hotel.airportDistanceKm,
        blackoutText: hotel.blackoutText,
      },
      latitude: hotel.latitude,
      longitude: hotel.longitude,
      availabilityNotes,
    };
  } catch (err) {
    console.warn("[hotels-repo] İçerik sorgusu başarısız, boş içerik dönülüyor:", err);
    return emptyContent;
  }
}

// ---------------------------------------------------------------------------
// Oda detayı — DB-önce, mock-fallback
// ---------------------------------------------------------------------------

export interface GuestRoomRate {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  priceMinor: number;
  currency: string;
  minStayNights: number | null;
}

export interface GuestRoomDetail {
  hotel: { slug: string; name: string; imageUrl: string };
  room: {
    slug: string;
    name: string;
    tagline: string | null;
    description: string | null;
    sizeSqm: number | null;
    capacityAdults: number | null;
    capacityChildren: number | null;
    bedConfig: string | null;
    viewType: string | null;
    imageUrl: string | null;
    amenities: string[];
    boardType: string | null;
    unitCount: number | null;
    minStayNights: number | null;
    pricingNotes: string | null;
    priceMinor: number | null;
    currency: string;
    priceOnRequest: boolean;
    discountPercent: number | null;
    discountLabel: string | null;
    rates: GuestRoomRate[];
  };
}

/**
 * Oda detayını döner: önce DB (yayında otel + aktif oda), yoksa mock.
 */
export async function getPublishedRoom(
  hotelSlug: string,
  roomSlug: string,
): Promise<GuestRoomDetail | undefined> {
  if (isDbAvailable()) {
    try {
      const { getDb } = await import("@/lib/db");
      const { hotelsTable, roomsTable, roomRatesTable } = await import("@/lib/db/schema");
      const { and, asc, eq } = await import("drizzle-orm");
      const db = getDb();

      const [hotel] = await db
        .select({
          id: hotelsTable.id,
          slug: hotelsTable.slug,
          name: hotelsTable.name,
          imageUrl: hotelsTable.imageUrl,
        })
        .from(hotelsTable)
        .where(and(eq(hotelsTable.slug, hotelSlug), eq(hotelsTable.status, "yayinda")))
        .limit(1);

      if (hotel) {
        const [room] = await db
          .select()
          .from(roomsTable)
          .where(
            and(
              eq(roomsTable.hotelId, hotel.id),
              eq(roomsTable.slug, roomSlug),
              eq(roomsTable.isActive, true),
            ),
          )
          .limit(1);
        if (room) {
          const rates = await db
            .select()
            .from(roomRatesTable)
            .where(eq(roomRatesTable.roomId, room.id))
            .orderBy(asc(roomRatesTable.startDate));
          return {
            hotel: {
              slug: hotel.slug,
              name: hotel.name,
              imageUrl: hotel.imageUrl ?? "",
            },
            room: {
              slug: room.slug,
              name: room.name,
              tagline: room.tagline,
              description: room.description,
              sizeSqm: room.sizeSqm,
              capacityAdults: room.capacityAdults,
              capacityChildren: room.capacityChildren,
              bedConfig: room.bedConfig,
              viewType: room.viewType,
              imageUrl: room.imageUrl,
              amenities: room.amenities,
              boardType: room.boardType,
              unitCount: room.unitCount,
              minStayNights: room.minStayNights,
              pricingNotes: room.pricingNotes,
              priceMinor: room.priceMinor,
              currency: room.currency,
              priceOnRequest: room.priceOnRequest,
              discountPercent: room.discountPercent,
              discountLabel: room.discountLabel,
              rates,
            },
          };
        }
      }
    } catch (err) {
      console.warn("[hotels-repo] Oda sorgusu başarısız, mock'a düşülüyor:", err);
    }
  }

  const mock = getMockRoomBySlugs(hotelSlug, roomSlug);
  if (!mock) return undefined;
  return {
    hotel: {
      slug: mock.hotel.slug,
      name: mock.hotel.name,
      imageUrl: mock.hotel.imageUrl,
    },
    room: {
      slug: mock.room.slug,
      name: mock.room.name,
      tagline: mock.room.tagline,
      description: mock.room.description,
      sizeSqm: null,
      capacityAdults: null,
      capacityChildren: null,
      bedConfig: null,
      viewType: null,
      imageUrl: null,
      amenities: [],
      boardType: null,
      unitCount: null,
      minStayNights: null,
      pricingNotes: null,
      priceMinor: null,
      currency: "TRY",
      priceOnRequest: true,
      discountPercent: null,
      discountLabel: null,
      rates: [],
    },
  };
}

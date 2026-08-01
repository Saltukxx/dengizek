// ---------------------------------------------------------------------------
// Misafir tarafı otel deposu — DB-önce, DB yoksa/hata varsa mock'a düşer.
// Görünürlük şartı tek kaynaktan gelir: @/lib/hotel-visibility (status değil,
// yayınlanmış snapshot varlığı). Misafir sayfaları HotelMock şekli bekler;
// DB satırları bu şekle eşlenir.
// ---------------------------------------------------------------------------

import {
  getHotelBySlug as getMockHotelBySlug,
  getHotels as getMockHotels,
  getRoomBySlugs as getMockRoomBySlugs,
  type HotelMock,
} from "@/lib/mocks/hotels";
import type { ChildAgePrice, Extra, Promotion, Restaurant, Room, RoomRate } from "@/lib/db/schema";
import type { GuestPromotion, GuestRatePlanPrice } from "@/lib/guest-pricing";
import { parseHotelContentSnapshot } from "@/lib/schemas/hotel-content-snapshot";

function isDbAvailable(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function shouldUseMockFallback(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.USE_MOCK_DATA === "true";
}

export function legacySnapshotFallbackEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.SNAPSHOT_LEGACY_FALLBACK === "true";
}

function rethrowUnlessMockAllowed(context: string, err: unknown): void {
  console.warn(`[hotels-repo] ${context}:`, err);
  if (!shouldUseMockFallback()) {
    throw err instanceof Error ? err : new Error(String(err));
  }
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
  publishedSnapshot?: unknown;
}): HotelMock {
  const parsed = parseHotelContentSnapshot(row.publishedSnapshot);
  const snapshot = parsed.success ? parsed.data.hotel : {};
  const value = <T>(key: string, fallback: T) => (key in snapshot ? snapshot[key] as T : fallback);
  // Oda tipleri henüz DB'de modellenmedi — mock'ta varsa oradan tamamlanır
  const mock = getMockHotelBySlug(row.slug);
  return {
    slug: row.slug,
    name: value("name", row.name),
    city: value("city", row.city) ?? "",
    country: value("country", row.country) ?? "",
    shortDescription: value("shortDescription", row.shortDescription) ?? "",
    longDescription: value("longDescription", row.longDescription) ?? "",
    imageUrl: value("imageUrl", row.imageUrl) ?? "",
    priceLabel: value("priceLabel", row.priceLabel) ?? undefined,
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
  /** Yayındaki yorumların ortalaması (1–5); yorum yoksa null */
  reviewAverage: number | null;
  reviewCount: number;
}

export interface BrowseFilters {
  /** Serbest metin — ad/şehir/ülke üzerinde arar. */
  q?: string;
}

/**
 * Browse filtreleri için genişletilmiş otel listesi.
 *
 * Metin araması SQL'e taşındı (pg_trgm + GIN indeks, migration 0014) — aksi
 * halde her istek tüm otelleri çekip JS'te süzüyordu. Arama snapshot-farkındadır:
 * yayındaki değer publishedSnapshot'tan gelir, o yoksa kolondan (COALESCE),
 * böylece SQL süzmesi aşağıdaki snapshot eşlemesiyle aynı sonucu verir.
 *
 * Yıldız/olanak/evcil/fiyat filtreleri bilinçli olarak JS'te kalır: bunlar
 * snapshot içindeki dizilerden ve oda listesinden türetiliyor, SQL'e taşımak
 * davranışı değiştirme riski taşır.
 */
export async function getPublishedHotelsForBrowse(
  filters: BrowseFilters = {},
): Promise<BrowseHotelRow[]> {
  if (isDbAvailable()) {
    try {
      const { getDb } = await import("@/lib/db");
      const { hotelsTable, reviewsTable, roomsTable } = await import("@/lib/db/schema");
      const { and, avg, count, eq, min, or, sql } = await import("drizzle-orm");
      const { guestVisibleHotelWhere } = await import("@/lib/hotel-visibility");
      const db = getDb();

      // Yayındaki değer: snapshot varsa oradan, yoksa kolondan.
      const published = (
        column:
          | typeof hotelsTable.name
          | typeof hotelsTable.city
          | typeof hotelsTable.country,
        key: string,
      ) => sql`coalesce(${hotelsTable.publishedSnapshot} -> 'hotel' ->> ${key}, ${column})`;

      const search = filters.q?.trim();
      const searchWhere = search
        ? or(
            sql`${published(hotelsTable.name, "name")} ilike ${"%" + search + "%"}`,
            sql`${published(hotelsTable.city, "city")} ilike ${"%" + search + "%"}`,
            sql`${published(hotelsTable.country, "country")} ilike ${"%" + search + "%"}`,
          )
        : undefined;

      // NOT: Bu toplamlar bilinçli olarak KORELE ALT SORGU DEĞİL. Drizzle,
      // sql`` şablonu içindeki kolonları niteliksiz üretir ("hotel_id" = "id"),
      // bu da alt sorgunun kendi tablosuna çözülüp korelasyonu sessizce bozar
      // (rooms.hotel_id = rooms.id → hep NULL). Ayrı GROUP BY sorguları +
      // JS'te birleştirme hem doğru hem okunabilir.
      const [rows, priceRows, reviewRows] = await Promise.all([
        db
          .select({
            id: hotelsTable.id,
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
            publishedSnapshot: hotelsTable.publishedSnapshot,
          })
          .from(hotelsTable)
          .where(and(guestVisibleHotelWhere(), searchWhere))
          .orderBy(hotelsTable.name),
        db
          .select({ hotelId: roomsTable.hotelId, minPriceMinor: min(roomsTable.priceMinor) })
          .from(roomsTable)
          .where(and(eq(roomsTable.isActive, true), eq(roomsTable.priceOnRequest, false)))
          .groupBy(roomsTable.hotelId),
        // Yorumlar snapshot'a girmez — kendi moderasyonları var, canlı okunur.
        db
          .select({
            hotelId: reviewsTable.hotelId,
            average: avg(reviewsTable.rating),
            total: count(),
          })
          .from(reviewsTable)
          .where(eq(reviewsTable.status, "yayinda"))
          .groupBy(reviewsTable.hotelId),
      ]);

      const minPriceByHotel = new Map(
        priceRows.map((r) => [r.hotelId, r.minPriceMinor == null ? null : Number(r.minPriceMinor)]),
      );
      const reviewsByHotel = new Map(
        reviewRows.map((r) => [
          r.hotelId,
          {
            // avg() numeric döner → postgres.js string verir.
            average: r.average == null ? null : Math.round(Number(r.average) * 10) / 10,
            total: Number(r.total),
          },
        ]),
      );

      return rows.filter((row) => legacySnapshotFallbackEnabled() || parseHotelContentSnapshot(row.publishedSnapshot).success).map((row) => {
        const parsed = parseHotelContentSnapshot(row.publishedSnapshot);
        const snapshot = parsed.success ? parsed.data.hotel : {};
        const value = <T>(key: string, fallback: T) => key in snapshot ? snapshot[key] as T : fallback;
        return {
          ...row,
          name: value("name", row.name),
          city: value("city", row.city),
          country: value("country", row.country),
          shortDescription: value("shortDescription", row.shortDescription),
          longDescription: value("longDescription", row.longDescription),
          imageUrl: value("imageUrl", row.imageUrl),
          priceLabel: value("priceLabel", row.priceLabel),
          starRating: value("starRating", row.starRating),
          amenities: value("amenities", row.amenities),
          petsAllowed: value("petsAllowed", row.petsAllowed),
          minPriceMinor: parsed.success
            ? parsed.data.rooms.filter((room) => room.isActive !== false && room.priceOnRequest !== true && typeof room.priceMinor === "number")
                .reduce<number | null>((acc, room) => acc == null ? room.priceMinor as number : Math.min(acc, room.priceMinor as number), null)
            : (minPriceByHotel.get(row.id) ?? null),
          reviewAverage: reviewsByHotel.get(row.id)?.average ?? null,
          reviewCount: reviewsByHotel.get(row.id)?.total ?? 0,
        };
      });
    } catch (err) {
      rethrowUnlessMockAllowed("DB sorgusu başarısız", err);
    }
  }
  if (!shouldUseMockFallback()) return [];
  // Mock yolunda SQL yok — aynı arama davranışını burada tekrarlarız.
  const needle = filters.q?.trim().toLowerCase();
  const mockHotels = needle
    ? getMockHotels().filter(
        (h) =>
          h.name.toLowerCase().includes(needle) ||
          h.city.toLowerCase().includes(needle) ||
          h.country.toLowerCase().includes(needle),
      )
    : getMockHotels();
  return mockHotels.map((h) => ({
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
    reviewAverage: null,
    reviewCount: 0,
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
      const { guestVisibleHotelBySlugWhere } = await import("@/lib/hotel-visibility");
      const [row] = await getDb()
        .select()
        .from(hotelsTable)
        .where(guestVisibleHotelBySlugWhere(slug))
        .limit(1);
      if (!row) return undefined;
      if (!legacySnapshotFallbackEnabled() && !parseHotelContentSnapshot(row.publishedSnapshot).success) return undefined;
      return toGuestHotel(row);
    } catch (err) {
      rethrowUnlessMockAllowed("DB sorgusu başarısız", err);
    }
  }
  if (!shouldUseMockFallback()) return undefined;
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
  /** Otelin yayınlanmış adı — AI system prompt'unda slug yerine kullanılır. */
  name?: string | null;
  rooms: RoomWithRates[];
  restaurants: Restaurant[];
  extras: Extra[];
  amenities: string[];
  specs: HotelSpecs;
  gallery: { url: string; caption: string | null }[];
  latitude: string | null;
  longitude: string | null;
  availabilityNotes: GuestAvailabilityNote[];
  promotions: GuestPromotion[];
  ratePlanPrices: GuestRatePlanPrice[];
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
  name: null,
  rooms: [],
  restaurants: [],
  extras: [],
  amenities: [],
  specs: emptySpecs,
  gallery: [],
  latitude: null,
  longitude: null,
  availabilityNotes: [],
  promotions: [],
  ratePlanPrices: [],
};

/**
 * Yayında olan otelin misafir içeriğini döner (yalnızca isActive, sıralı).
 * DB yoksa veya otel yayında değilse boş içerik döner — sayfalar mock'la
 * çalışmaya devam eder.
 */
// slug→id eşlemesi değişmez — analytics atıfları için küçük süreç-içi cache.
const hotelIdBySlugCache = new Map<string, string | null>();

/** Yayındaki otelin uuid'sini döner (analytics hotel_id atfı için). */
export async function getHotelIdBySlug(slug: string): Promise<string | null> {
  if (!isDbAvailable()) return null;
  const cached = hotelIdBySlugCache.get(slug);
  if (cached !== undefined) return cached;
  try {
    // Dosya genelindeki kalıp: db/schema modülleri mock modda hiç yüklenmesin
    // diye dinamik import edilir.
    const { getDb } = await import("@/lib/db");
    const { hotelsTable } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = getDb();
    const [row] = await db
      .select({ id: hotelsTable.id })
      .from(hotelsTable)
      .where(eq(hotelsTable.slug, slug))
      .limit(1);
    const id = row?.id ?? null;
    hotelIdBySlugCache.set(slug, id);
    return id;
  } catch {
    return null;
  }
}

export async function getPublishedHotelContent(
  slug: string,
): Promise<PublishedHotelContent> {
  if (!isDbAvailable()) return emptyContent;
  try {
    const { getDb } = await import("@/lib/db");
    const {
      hotelsTable,
      roomsTable,
      roomRatesTable,
      restaurantsTable,
      extrasTable,
      hotelGalleryImagesTable,
      hotelAvailabilityNotesTable,
      promotionsTable,
      ratePlansTable,
      roomRatePlanPricesTable,
    } = await import("@/lib/db/schema");
    const { and, asc, eq, or, isNull, lte, gte } = await import("drizzle-orm");
    const { guestVisibleHotelBySlugWhere } = await import("@/lib/hotel-visibility");
    const db = getDb();

    const [snapshotRow] = await db.select({ publishedSnapshot: hotelsTable.publishedSnapshot })
      .from(hotelsTable)
      .where(guestVisibleHotelBySlugWhere(slug))
      .limit(1);
    const parsedSnapshot = parseHotelContentSnapshot(snapshotRow?.publishedSnapshot);
    if (parsedSnapshot.success) {
      const snapshot = parsedSnapshot.data;
      const hotel = snapshot.hotel;
      const rooms = snapshot.rooms as unknown as Room[];
      const rates = snapshot.roomRates as unknown as RoomRate[];
      const ratesByRoom = new Map<string, RoomRate[]>();
      for (const rate of rates) ratesByRoom.set(rate.roomId, [...(ratesByRoom.get(rate.roomId) ?? []), rate]);
      const defaultPlan = snapshot.ratePlans.find((plan) => plan.isDefault === true);
      const prices = snapshot.ratePlanPrices.filter((price) => price.ratePlanId === defaultPlan?.id);
      return {
        name: (hotel.name as string | null) ?? null,
        rooms: rooms.filter((room) => room.isActive).sort((a, b) => a.orderIndex - b.orderIndex).map((room) => ({ ...room, rates: ratesByRoom.get(room.id) ?? [] })),
        restaurants: (snapshot.restaurants as unknown as Restaurant[]).filter((item) => item.isActive).sort((a, b) => a.orderIndex - b.orderIndex),
        extras: (snapshot.extras as unknown as Extra[]).filter((item) => item.isActive).sort((a, b) => a.orderIndex - b.orderIndex),
        amenities: (hotel.amenities as string[] | undefined) ?? [],
        specs: {
          starRating: (hotel.starRating as number | null) ?? null,
          totalRooms: (hotel.totalRooms as number | null) ?? null,
          checkInTime: (hotel.checkInTime as string | null) ?? null,
          checkOutTime: (hotel.checkOutTime as string | null) ?? null,
          cancellationPolicy: (hotel.cancellationPolicy as string | null) ?? null,
          childPolicy: (hotel.childPolicy as string | null) ?? null,
          petsAllowed: (hotel.petsAllowed as boolean | null) ?? null,
          paymentMethods: (hotel.paymentMethods as string[] | undefined) ?? [],
          address: (hotel.address as string | null) ?? null,
          phone: (hotel.phone as string | null) ?? null,
          contactEmail: (hotel.contactEmail as string | null) ?? null,
          airportDistanceKm: (hotel.airportDistanceKm as number | null) ?? null,
          blackoutText: (hotel.blackoutText as string | null) ?? null,
        },
        gallery: snapshot.gallery.map((item) => ({ url: String(item.url), caption: item.caption == null ? null : String(item.caption) })),
        latitude: (hotel.latitude as string | null) ?? null,
        longitude: (hotel.longitude as string | null) ?? null,
        availabilityNotes: snapshot.availabilityNotes.map((item) => ({ label: String(item.label), startDate: item.startDate == null ? null : String(item.startDate), endDate: item.endDate == null ? null : String(item.endDate), isBlackout: Boolean(item.isBlackout) })),
        promotions: (snapshot.promotions as unknown as Promotion[]).filter((item) => item.isActive).map((item) => ({ name: item.name, discountPercent: item.discountPercent, validFrom: item.validFrom ? String(item.validFrom) : null, validTo: item.validTo ? String(item.validTo) : null, minNights: item.minNights, roomIds: item.roomIds, isActive: item.isActive })),
        ratePlanPrices: prices.map((item) => ({ roomId: String(item.roomId), name: String(item.name), startDate: String(item.startDate), endDate: String(item.endDate), priceMinor: Number(item.priceMinor), currency: String(item.currency), minStayNights: item.minStayNights == null ? null : Number(item.minStayNights), occupancyPrices: (item.occupancyPrices as { guestCount: number; priceMinor: number }[] | undefined) ?? [] })),
      };
    }

    if (!legacySnapshotFallbackEnabled()) return emptyContent;

    const [hotel] = await db
      .select({
        id: hotelsTable.id,
        name: hotelsTable.name,
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
      .where(guestVisibleHotelBySlugWhere(slug))
      .limit(1);
    if (!hotel) return emptyContent;

    const { todayIso } = await import("@/lib/price");
    const today = todayIso();

    const [rooms, rates, restaurants, extras, gallery, availabilityNotes, promotions, defaultPlan] =
      await Promise.all([
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
      db
        .select()
        .from(promotionsTable)
        .where(
          and(
            eq(promotionsTable.hotelId, hotel.id),
            eq(promotionsTable.isActive, true),
            or(isNull(promotionsTable.validFrom), lte(promotionsTable.validFrom, today)),
            or(isNull(promotionsTable.validTo), gte(promotionsTable.validTo, today)),
          ),
        ),
      db
        .select({ id: ratePlansTable.id })
        .from(ratePlansTable)
        .where(and(eq(ratePlansTable.hotelId, hotel.id), eq(ratePlansTable.isDefault, true)))
        .limit(1),
    ]);

    const ratePlanPrices =
      defaultPlan[0]?.id != null
        ? await db
            .select({
              roomId: roomRatePlanPricesTable.roomId,
              name: roomRatePlanPricesTable.name,
              startDate: roomRatePlanPricesTable.startDate,
              endDate: roomRatePlanPricesTable.endDate,
              priceMinor: roomRatePlanPricesTable.priceMinor,
              currency: roomRatePlanPricesTable.currency,
              minStayNights: roomRatePlanPricesTable.minStayNights,
              occupancyPrices: roomRatePlanPricesTable.occupancyPrices,
            })
            .from(roomRatePlanPricesTable)
            .where(eq(roomRatePlanPricesTable.ratePlanId, defaultPlan[0].id))
        : [];

    const ratesByRoom = new Map<string, RoomRate[]>();
    for (const rate of rates) {
      const list = ratesByRoom.get(rate.roomId) ?? [];
      list.push(rate);
      ratesByRoom.set(rate.roomId, list);
    }

    return {
      name: hotel.name,
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
      promotions: promotions.map((p: Promotion) => ({
        name: p.name,
        discountPercent: p.discountPercent,
        validFrom: p.validFrom ? String(p.validFrom) : null,
        validTo: p.validTo ? String(p.validTo) : null,
        minNights: p.minNights,
        roomIds: p.roomIds,
        isActive: p.isActive,
      })),
      ratePlanPrices: ratePlanPrices.map((p) => ({
        roomId: p.roomId,
        name: p.name,
        startDate: String(p.startDate),
        endDate: String(p.endDate),
        priceMinor: p.priceMinor,
        currency: p.currency,
        minStayNights: p.minStayNights,
        occupancyPrices: p.occupancyPrices ?? [],
      })),
    };
  } catch (err) {
    rethrowUnlessMockAllowed("İçerik sorgusu başarısız", err);
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
  occupancyPrices?: { guestCount: number; priceMinor: number }[];
  childAgePrices?: ChildAgePrice[];
}

export interface GuestRoomDetail {
  hotel: { slug: string; name: string; imageUrl: string };
  promotions: GuestPromotion[];
  ratePlanPrices: GuestRatePlanPrice[];
  room: {
    id: string;
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
    childAgePrices?: ChildAgePrice[];
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
      const { guestVisibleHotelBySlugWhere } = await import("@/lib/hotel-visibility");
      const db = getDb();

      const [hotel] = await db
        .select({
          id: hotelsTable.id,
          slug: hotelsTable.slug,
          name: hotelsTable.name,
          imageUrl: hotelsTable.imageUrl,
          publishedSnapshot: hotelsTable.publishedSnapshot,
        })
        .from(hotelsTable)
        .where(guestVisibleHotelBySlugWhere(hotelSlug))
        .limit(1);

      if (hotel) {
        const published = parseHotelContentSnapshot(hotel.publishedSnapshot);
        if (published.success) {
          const hotelData = published.data.hotel;
          const room = published.data.rooms.find((item) => item.slug === roomSlug && item.isActive !== false);
          if (!room) return undefined;
          const rates = published.data.roomRates.filter((item) => item.roomId === room.id) as unknown as GuestRoomRate[];
          const content = await getPublishedHotelContent(hotelSlug);
          return {
            hotel: { slug: hotelSlug, name: String(hotelData.name ?? hotel.name), imageUrl: String(hotelData.imageUrl ?? "") },
            promotions: content.promotions,
            ratePlanPrices: content.ratePlanPrices,
            room: {
              id: String(room.id), slug: String(room.slug), name: String(room.name), tagline: room.tagline == null ? null : String(room.tagline), description: room.description == null ? null : String(room.description),
              sizeSqm: room.sizeSqm == null ? null : Number(room.sizeSqm), capacityAdults: room.capacityAdults == null ? null : Number(room.capacityAdults), capacityChildren: room.capacityChildren == null ? null : Number(room.capacityChildren),
              bedConfig: room.bedConfig == null ? null : String(room.bedConfig), viewType: room.viewType == null ? null : String(room.viewType), imageUrl: room.imageUrl == null ? null : String(room.imageUrl), amenities: (room.amenities as string[] | undefined) ?? [],
              boardType: room.boardType == null ? null : String(room.boardType), unitCount: room.unitCount == null ? null : Number(room.unitCount), minStayNights: room.minStayNights == null ? null : Number(room.minStayNights), pricingNotes: room.pricingNotes == null ? null : String(room.pricingNotes),
              priceMinor: room.priceMinor == null ? null : Number(room.priceMinor), currency: String(room.currency ?? "TRY"), priceOnRequest: Boolean(room.priceOnRequest), discountPercent: room.discountPercent == null ? null : Number(room.discountPercent), discountLabel: room.discountLabel == null ? null : String(room.discountLabel), childAgePrices: (room.childAgePrices as ChildAgePrice[] | undefined) ?? [], rates,
            },
          };
        }
        if (!legacySnapshotFallbackEnabled()) return undefined;
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
          const content = await getPublishedHotelContent(hotelSlug);
          return {
            hotel: {
              slug: hotel.slug,
              name: hotel.name,
              imageUrl: hotel.imageUrl ?? "",
            },
            promotions: content.promotions,
            ratePlanPrices: content.ratePlanPrices,
            room: {
              id: room.id,
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
              childAgePrices: room.childAgePrices,
              rates,
            },
          };
        }
      }
    } catch (err) {
      rethrowUnlessMockAllowed("Oda sorgusu başarısız", err);
    }
  }

  if (!shouldUseMockFallback()) return undefined;

  const mock = getMockRoomBySlugs(hotelSlug, roomSlug);
  if (!mock) return undefined;
  return {
    hotel: {
      slug: mock.hotel.slug,
      name: mock.hotel.name,
      imageUrl: mock.hotel.imageUrl,
    },
    promotions: [],
    ratePlanPrices: [],
    room: {
      id: mock.room.slug,
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

// ---------------------------------------------------------------------------
// Misafir yorumları — publishedSnapshot'a GİRMEZ.
// Yorumların kendi moderasyon zinciri var (reviews.status); tesis içerik
// sürümüne bağlanırsa onaylı yorumlar yeni sürüm bekler hale gelirdi.
// ---------------------------------------------------------------------------

export interface GuestReview {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  guestName: string;
  stayDate: string | null;
  /** "verified_guest" → misafir portalından yazılmış, doğrulanmış yorum */
  source: string;
  reply: string | null;
  createdAt: string;
}

export interface GuestReviewSummary {
  reviews: GuestReview[];
  count: number;
  /** 1–5 arası ortalama, tek ondalık; yorum yoksa null */
  average: number | null;
  /** Puan → adet (1..5) */
  distribution: Record<number, number>;
}

const emptyReviewSummary: GuestReviewSummary = {
  reviews: [],
  count: 0,
  average: null,
  distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
};

/** Yayındaki yorumları ve puan özetini döner (misafir otel sayfası). */
export async function getPublishedReviews(slug: string): Promise<GuestReviewSummary> {
  if (!isDbAvailable()) return emptyReviewSummary;
  try {
    const { getDb } = await import("@/lib/db");
    const { hotelsTable, reviewsTable } = await import("@/lib/db/schema");
    const { and, desc, eq } = await import("drizzle-orm");
    const { guestVisibleHotelBySlugWhere } = await import("@/lib/hotel-visibility");

    const rows = await getDb()
      .select({
        id: reviewsTable.id,
        rating: reviewsTable.rating,
        title: reviewsTable.title,
        body: reviewsTable.body,
        guestName: reviewsTable.guestName,
        stayDate: reviewsTable.stayDate,
        source: reviewsTable.source,
        reply: reviewsTable.reply,
        createdAt: reviewsTable.createdAt,
      })
      .from(reviewsTable)
      .innerJoin(hotelsTable, eq(hotelsTable.id, reviewsTable.hotelId))
      .where(and(guestVisibleHotelBySlugWhere(slug), eq(reviewsTable.status, "yayinda")))
      .orderBy(desc(reviewsTable.createdAt))
      .limit(100);

    if (rows.length === 0) return emptyReviewSummary;

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let total = 0;
    for (const r of rows) {
      total += r.rating;
      distribution[r.rating] = (distribution[r.rating] ?? 0) + 1;
    }

    return {
      reviews: rows.map((r) => ({
        ...r,
        stayDate: r.stayDate == null ? null : String(r.stayDate),
        createdAt: r.createdAt.toISOString(),
      })),
      count: rows.length,
      average: Math.round((total / rows.length) * 10) / 10,
      distribution,
    };
  } catch (err) {
    // Yorumlar ikincil içerik — hata otel sayfasını düşürmemeli.
    console.warn("[hotels-repo] Yorum sorgusu başarısız:", err);
    return emptyReviewSummary;
  }
}

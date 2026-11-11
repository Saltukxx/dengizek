import { describe, expect, it } from "vitest";
import type { BrowseHotelRow, PublishedHotelContent } from "@/lib/hotels-repo";
import type { HotelMock } from "@/lib/mocks/hotels";
import { parseStaySearch } from "@/lib/stay-search";
import { parseMobileBrowseFilters, parseMobileSeason, toMobileHotelCard, toMobileHotelDetail, toMobileStayQuote } from "./v1";

const row = (over: Partial<BrowseHotelRow> = {}): BrowseHotelRow =>
  ({
    slug: "orucoglu", name: "Oruçoğlu", city: "Afyonkarahisar", country: "Türkiye",
    shortDescription: "Termal", longDescription: null, imageUrl: "", priceLabel: null,
    starRating: 5, amenities: [], petsAllowed: null, seasons: ["termal"], minPriceMinor: null,
    upcomingPrice: null, reviewAverage: null, reviewCount: 0, tourId: null, promotionBadge: null,
    ...over,
  }) as BrowseHotelRow;

describe("mobil API v1", () => {
  it("sezon yalnız bilinen değerleri kabul eder", () => {
    expect(parseMobileSeason("termal")).toBe("termal");
    expect(parseMobileSeason("ilkbahar")).toBeUndefined();
    expect(parseMobileSeason(null)).toBeUndefined();
  });

  it("kart: bugünkü fiyat öncelikli, boş görsel null olur", () => {
    const card = toMobileHotelCard(row({ minPriceMinor: 820000, upcomingPrice: { priceMinor: 1, currency: "TRY", fromDate: "2026-12-01" } }));
    expect(card.price).toEqual({ amountMinor: 820000, currency: "TRY", fromDate: null });
    expect(card.imageUrl).toBeNull();
    expect(card.highlights).toEqual([]);
  });

  it("kart: bugün fiyat yoksa 'X tarihinden itibaren' fiyatı", () => {
    const card = toMobileHotelCard(row({ upcomingPrice: { priceMinor: 500000, currency: "TRY", fromDate: "2026-11-14" } }));
    expect(card.price).toEqual({ amountMinor: 500000, currency: "TRY", fromDate: "2026-11-14" });
  });

  it("detay: koordinat sayıya çevrilir, eksikse konum null; iç alanlar sızmaz", () => {
    const hotel = { slug: "a", name: "A", city: "X", country: "TR", shortDescription: "", longDescription: "", imageUrl: "", roomTypes: [] } as HotelMock;
    const content = {
      name: null, rooms: [], restaurants: [], extras: [], amenities: ["Spa"], gallery: [],
      latitude: "38.75", longitude: "30.55", availabilityNotes: [], promotions: [], ratePlanPrices: [],
      specs: { starRating: 4, totalRooms: 10, checkInTime: "14:00", checkOutTime: "12:00", cancellationPolicy: null, childPolicy: null,
        petsAllowed: false, seasons: [], paymentMethods: [], publicPhone: "+90 272 000 00 00", whatsappPhone: null, address: "Afyon", airportDistanceKm: null, blackoutText: null },
    } as PublishedHotelContent;
    const detail = toMobileHotelDetail(hotel, content, []);
    expect(detail.location).toEqual({ latitude: 38.75, longitude: 30.55, address: "Afyon" });
    expect(detail.contact.phone).toBe("+90 272 000 00 00");
    expect(detail.shortDescription).toBeNull();
    expect(Object.keys(detail)).not.toContain("ratePlanPrices");
    expect(toMobileHotelDetail(hotel, { ...content, latitude: null }, []).location).toBeNull();
    expect(detail.price).toBeNull();
  });

  it("otel sayfası fiyatı kartla aynı kaynaktan gelir", () => {
    const hotel = { slug: "orucoglu", name: "Oruçoğlu" } as never;
    const content = { name: "Oruçoğlu", amenities: [], gallery: [], rooms: [], latitude: null, longitude: null, specs: {} } as never;
    expect(toMobileHotelDetail(hotel, content, [], row({ minPriceMinor: 450000 })).price).toEqual({
      amountMinor: 450000, currency: "TRY", fromDate: null,
    });
    expect(toMobileHotelDetail(hotel, content, [], row()).price).toBeNull();
  });

  it("otel sayfası yorumları: özet ve en yeni 10 yorum; iç alanlar (kaynak) taşınmaz", () => {
    const hotel = { slug: "orucoglu", name: "Oruçoğlu" } as never;
    const content = { name: "Oruçoğlu", amenities: [], gallery: [], rooms: [], latitude: null, longitude: null, specs: {} } as never;
    expect(toMobileHotelDetail(hotel, content, []).reviews).toEqual({ average: null, count: 0, items: [] });

    const reviews = Array.from({ length: 12 }, (_, i) => ({
      id: `r${i}`, rating: 5, title: i === 0 ? "Harika" : null, body: "Çok temizdi.", guestName: "Ayşe Y.",
      stayDate: i === 0 ? "2026-10-02" : null, source: "verified_guest", reply: i === 0 ? "Teşekkürler." : null,
      createdAt: "2026-10-10T08:00:00.000Z",
    }));
    const detail = toMobileHotelDetail(hotel, content, [], null, {
      reviews, count: 12, average: 4.8, distribution: { 1: 0, 2: 0, 3: 0, 4: 2, 5: 10 },
    } as never);
    expect(detail.reviews.average).toBe(4.8);
    expect(detail.reviews.count).toBe(12);
    expect(detail.reviews.items).toHaveLength(10);
    expect(detail.reviews.items[0]).toEqual({
      id: "r0", rating: 5, title: "Harika", body: "Çok temizdi.", guestName: "Ayşe Y.",
      stayDate: "2026-10-02", reply: "Teşekkürler.", createdAt: "2026-10-10T08:00:00.000Z",
    });
    expect(JSON.stringify(detail.reviews)).not.toContain("verified_guest");
  });
});

describe("mobil API v1 — tur", () => {
  it("adımları sıralar, AI alanlarını ve otel profilini taşımaz", async () => {
    const { toMobileTour } = await import("./v1");
    const tour = toMobileTour({
      tourId: "t", hotelSlug: "h", version: 1,
      hotelProfile: { aiPersona: "x", language: "tr" },
      steps: [
        { stepId: "b", order: 2, kind: "room", title: "Oda", requiresUserContinue: false, media: { mode: "clip", src: "/v/b.mp4" }, aiDescription: "gizli" },
        { stepId: "a", order: 1, kind: "lobby", title: "Lobi", requiresUserContinue: true, media: { mode: "window", src: "/v/all.mp4", startSec: 0, endSec: 8 },
          branches: [{ id: "x", label: "Odaya geç", nextStepId: "b" }] },
      ],
    } as never);
    expect(tour.steps.map((s) => s.stepId)).toEqual(["a", "b"]);
    expect(tour.steps[0].media).toEqual({ mode: "window", src: "/v/all.mp4", startSec: 0, endSec: 8 });
    expect(tour.steps[0].branches).toHaveLength(1);
    expect(JSON.stringify(tour)).not.toContain("gizli");
    expect(tour).not.toHaveProperty("hotelProfile");
  });

  it("liste süzgeci web parametre adlarını okur, bozuk değerleri yok sayar", () => {
    const f = parseMobileBrowseFilters(new URLSearchParams("stars=4&tur=1&price=mid&sort=price-asc&giris=2027-01-10&cikis=2027-01-12&yetiskin=3&cocuk=5,9"));
    expect(f).toMatchObject({ minStars: 4, tourOnly: true, promoOnly: false, priceBand: "mid", sort: "price-asc" });
    expect(f.stay).toMatchObject({ checkIn: "2027-01-10", checkOut: "2027-01-12", adults: 3, childAges: [5, 9] });
    const bad = parseMobileBrowseFilters(new URLSearchParams("stars=9&price=ucuz&sort=x"));
    expect(bad.minStars).toBeUndefined();
    expect(bad.priceBand).toBeUndefined();
    expect(bad.sort).toBeUndefined();
  });

  it("tarihli fiyat: pansiyon etiketi ve minimum konaklama alanı", () => {
    const stay = parseStaySearch(new URLSearchParams("giris=2027-01-10&cikis=2027-01-12&yetiskin=2"));
    const quote = toMobileStayQuote(
      { ok: true, nights: 2, rooms: [{ slug: "std", name: "Standart", imageUrl: null, boardType: "hersey-dahil", fit: "fits", totalMinor: 3_000_000,
        originalTotalMinor: null, currency: "TRY", discountLabel: null, freeNights: 0, unavailable: null, minStayShortfall: 3 }] },
      stay,
    );
    expect(quote).toMatchObject({ checkIn: "2027-01-10", nights: 2, adults: 2 });
    expect(quote.rooms[0]).toMatchObject({ boardLabel: "Her şey dahil", minStayNights: 3, totalMinor: 3_000_000 });
  });
});

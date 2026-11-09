import { describe, expect, it } from "vitest";
import type { BrowseHotelRow, PublishedHotelContent } from "@/lib/hotels-repo";
import type { HotelMock } from "@/lib/mocks/hotels";
import { parseMobileSeason, toMobileHotelCard, toMobileHotelDetail } from "./v1";

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
});

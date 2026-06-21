import { describe, expect, it, vi } from "vitest";
import { resolveGuestRoomPrice } from "@/lib/guest-pricing";
import { formatPrice } from "@/lib/price";

vi.mock("@/lib/hotels-repo", () => ({
  getPublishedHotelContent: vi.fn(),
}));

import { getPublishedHotelContent } from "@/lib/hotels-repo";
import { queryRoomPrices } from "@/lib/ai/price-engine";

const emptySpecs = {
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

const room = {
  id: "room-1",
  slug: "deluxe",
  name: "Deluxe Deniz",
  priceMinor: 450000,
  currency: "TRY",
  priceOnRequest: false,
  discountPercent: null,
  discountLabel: null,
  minStayNights: null,
  boardType: "sadece-oda",
  rates: [],
  capacityAdults: 2,
  capacityChildren: 0,
};

function mockContent() {
  vi.mocked(getPublishedHotelContent).mockResolvedValue({
    rooms: [room as never],
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
  });
}

describe("queryRoomPrices", () => {
  it("bugünkü gecelik fiyatı döner", async () => {
    mockContent();
    const result = await queryRoomPrices("aurelia-bay", { roomSlug: "deluxe" });
    expect(result.ok).toBe(true);
    expect(result.cards[0]?.lines[0]?.value).toBe(formatPrice(450000, "TRY", false));
  });

  it("tarih aralığı toplamını hesaplar", async () => {
    mockContent();
    const result = await queryRoomPrices("aurelia-bay", {
      roomSlug: "deluxe",
      checkIn: "2026-07-01",
      checkOut: "2026-07-03",
    });
    expect(result.ok).toBe(true);
    const totalLine = result.cards[0]?.lines.find((l) => l.label === "Konaklama toplamı");
    expect(totalLine?.value).toBe(formatPrice(900000, "TRY", false));
  });
});

describe("resolveGuestRoomPrice occupancy", () => {
  it("kişi sayısına göre fiyat seçer", () => {
    const price = resolveGuestRoomPrice({
      room: {
        id: "r1",
        priceMinor: 10000,
        currency: "TRY",
        priceOnRequest: false,
        discountPercent: null,
        discountLabel: null,
      },
      rates: [
        {
          name: "Yaz",
          startDate: "2020-01-01",
          endDate: "2030-12-31",
          priceMinor: 10000,
          currency: "TRY",
          occupancyPrices: [{ guestCount: 3, priceMinor: 13000 }],
        },
      ],
      guestCount: 3,
    });
    expect(price.priceMinor).toBe(13000);
  });
});

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
  seasons: [],
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
    }, "2026-06-01");
    expect(result.ok).toBe(true);
    const totalLine = result.cards[0]?.lines.find((l) => l.label === "Konaklama toplamı");
    expect(totalLine?.value).toBe(formatPrice(900000, "TRY", false));
  });

  it("çocuk yaşına göre ek ücreti gecelik fiyata ekler", async () => {
    vi.mocked(getPublishedHotelContent).mockResolvedValue({
      rooms: [
        {
          ...room,
          childAgePrices: [
            { ageFrom: 0, ageTo: 6, mode: "ucretsiz" },
            { ageFrom: 7, ageTo: 12, mode: "sabit", priceMinor: 50000 },
          ],
        } as never,
      ],
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
    const result = await queryRoomPrices("aurelia-bay", {
      roomSlug: "deluxe",
      childAges: [4, 9],
    });
    expect(result.ok).toBe(true);
    expect(result.cards[0]?.lines[0]?.value).toBe(formatPrice(500000, "TRY", false));
    const childLine = result.cards[0]?.lines.find((l) => l.label === "Çocuk fiyatları");
    expect(childLine?.value).toBe(
      `4 yaş: ${formatPrice(0, "TRY", false)} · 9 yaş: ${formatPrice(50000, "TRY", false)}`,
    );
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

describe("queryRoomPrices — doğruluk kuralları", () => {
  const TODAY = "2026-06-01";

  function mockRooms(rooms: unknown[], extra: Record<string, unknown> = {}) {
    vi.mocked(getPublishedHotelContent).mockResolvedValue({
      rooms: rooms as never,
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
      ...extra,
    });
  }
  const line = (result: Awaited<ReturnType<typeof queryRoomPrices>>, label: string, card = 0) =>
    result.cards[card]?.lines.find((l) => l.label === label)?.value;

  it("geçmiş tarihi fiyatlamaz", async () => {
    mockRooms([room]);
    const result = await queryRoomPrices("h", { checkIn: "2026-05-20", checkOut: "2026-05-22" }, TODAY);
    expect(result).toMatchObject({ ok: false, errorCode: "past_date" });
  });

  it("18 aydan uzak ve 30 geceden uzun konaklamayı fiyatlamaz", async () => {
    mockRooms([room]);
    expect(await queryRoomPrices("h", { checkIn: "2028-06-01", checkOut: "2028-06-03" }, TODAY)).toMatchObject({
      ok: false,
      errorCode: "too_far",
    });
    expect(await queryRoomPrices("h", { checkIn: "2026-07-01", checkOut: "2026-08-15" }, TODAY)).toMatchObject({
      ok: false,
      errorCode: "too_long",
    });
  });

  it("her gece kendi dönemiyle fiyatlanır ve dönemin min. konaklaması denetlenir", async () => {
    mockRooms([
      {
        ...room,
        rates: [{ name: "Yüksek sezon", startDate: "2026-07-02", endDate: "2026-07-31", priceMinor: 600000, currency: "TRY", minStayNights: 3 }],
      },
    ]);
    const result = await queryRoomPrices("h", { checkIn: "2026-07-01", checkOut: "2026-07-03" }, TODAY);
    expect(result.ok).toBe(true);
    // 1 Temmuz baz (4.500) + 2 Temmuz sezon (6.000)
    expect(line(result, "Konaklama toplamı")).toBe(formatPrice(1050000, "TRY", false));
    expect(line(result, "Min. konaklama")).toMatch(/en az 3 gece/);
  });

  it("farklı para birimindeki geceleri toplamaz", async () => {
    mockRooms([
      {
        ...room,
        rates: [{ name: "Yaz (EUR)", startDate: "2026-07-02", endDate: "2026-07-31", priceMinor: 15000, currency: "EUR" }],
      },
    ]);
    const result = await queryRoomPrices("h", { checkIn: "2026-07-01", checkOut: "2026-07-03" }, TODAY);
    expect(line(result, "Konaklama toplamı")).toBe("Talep üzerine");
    expect(result.cards[0]?.priceOnRequest).toBe(true);
  });

  it("oda belirtilmediyse kişi sayısını almayan odaları listelemez", async () => {
    mockRooms([room, { ...room, id: "room-2", slug: "family", name: "Aile", capacityAdults: 4 }]);
    const result = await queryRoomPrices("h", { guestCount: 4 }, TODAY);
    expect(result.cards.map((c) => c.roomSlug)).toEqual(["family"]);
  });

  it("belirtilen oda kapasiteyi aşıyorsa kartta yazar", async () => {
    mockRooms([room]);
    const result = await queryRoomPrices("h", { roomSlug: "deluxe", guestCount: 3 }, TODAY);
    expect(line(result, "Kapasite")).toMatch(/en fazla 2 yetişkin/);
  });

  it("yaşı bilinmeyen çocuğu fiyata eklemez, kartta yazar", async () => {
    mockRooms([{ ...room, capacityChildren: 2 }]);
    const result = await queryRoomPrices("h", { roomSlug: "deluxe", guestCount: 2, childCount: 1 }, TODAY);
    expect(line(result, "Çocuklar")).toMatch(/1 çocuğun yaşı belirtilmedi/);
  });

  it("ay sorgusu bugünden itibaren gecelik aralığı verir", async () => {
    mockRooms([
      {
        ...room,
        rates: [{ name: "Yüksek sezon", startDate: "2026-07-15", endDate: "2026-08-31", priceMinor: 600000, currency: "TRY" }],
      },
    ]);
    const result = await queryRoomPrices("h", { month: "2026-07" }, TODAY);
    expect(result.ok).toBe(true);
    expect(line(result, "Gecelik fiyat")).toBe(
      `${formatPrice(450000, "TRY", false)} – ${formatPrice(600000, "TRY", false)} (geceye göre değişir)`,
    );
    expect(line(result, "Dönem")).toBe("Temmuz 2026 (1 Temmuz – 31 Temmuz)");
    expect(await queryRoomPrices("h", { month: "2026-05" }, TODAY)).toMatchObject({ ok: false, errorCode: "past_date" });
  });

  it("sonuç, fiyatlanan sorguyu geri verir (misafire geri söylenir)", async () => {
    mockRooms([room]);
    const query = { checkIn: "2026-07-01", checkOut: "2026-07-03", guestCount: 2 };
    expect((await queryRoomPrices("h", query, TODAY)).query).toEqual(query);
  });
});

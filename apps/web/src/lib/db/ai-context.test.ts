// ---------------------------------------------------------------------------
// AI bağlam testleri — mock içerikten gerçek satırı üretimi
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getPublishedHotelContentMock = vi.fn();
vi.mock("@/lib/hotels-repo", () => ({
  getPublishedHotelContent: (...args: unknown[]) => getPublishedHotelContentMock(...args),
}));

import { getHotelAiFacts } from "./ai-context";

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
};

const baseContent = {
  rooms: [],
  restaurants: [],
  extras: [],
  amenities: [],
  specs: emptySpecs,
};

const room = {
  id: "r1",
  slug: "seaview-deluxe",
  name: "Deniz Manzaralı Deluxe",
  sizeSqm: 32,
  capacityAdults: 2,
  capacityChildren: 1,
  bedConfig: "1 king yatak",
  viewType: "Deniz manzarası",
  boardType: "sadece-oda",
  unitCount: null,
  minStayNights: null,
  pricingNotes: null,
  priceMinor: 450000,
  currency: "TRY",
  priceOnRequest: false,
  discountPercent: null,
  discountLabel: null,
  rates: [],
};

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://test");
  getPublishedHotelContentMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getHotelAiFacts", () => {
  it("DATABASE_URL yoksa boş dizi döner", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const facts = await getHotelAiFacts("aurelia-bay");
    expect(facts).toEqual([]);
    expect(getPublishedHotelContentMock).not.toHaveBeenCalled();
  });

  it("oda satırını boyut, kapasite, yatak ve fiyatla üretir", async () => {
    getPublishedHotelContentMock.mockResolvedValue({ ...baseContent, rooms: [room] });
    const facts = await getHotelAiFacts("aurelia-bay");
    expect(facts).toHaveLength(1);
    expect(facts[0]).toContain("Deniz Manzaralı Deluxe");
    expect(facts[0]).toContain("32 m²");
    expect(facts[0]).toContain("2 yetişkin + 1 çocuk");
    expect(facts[0]).toContain("1 king yatak");
    expect(facts[0]).toContain("/gece");
  });

  it("restoran ve menü ürünlerini fiyatlarıyla listeler", async () => {
    getPublishedHotelContentMock.mockResolvedValue({
      ...baseContent,
      restaurants: [
        {
          id: "rest1",
          name: "Aurelia Teras",
          cuisine: "Akdeniz mutfağı",
          hours: "07:00 - 23:00",
          location: null,
          menu: [
            {
              id: "s1",
              title: "Ana Yemekler",
              items: [
                {
                  id: "m1",
                  name: "Izgara levrek",
                  currency: "TRY",
                  priceMinor: 78000,
                  priceOnRequest: false,
                  tags: [],
                },
              ],
            },
          ],
        },
      ],
    });
    const facts = await getHotelAiFacts("aurelia-bay");
    expect(facts.some((f) => f.includes("Aurelia Teras") && f.includes("Akdeniz mutfağı"))).toBe(true);
    expect(facts.some((f) => f.includes("Izgara levrek"))).toBe(true);
  });

  it("ekstraları ve 'talep üzerine' fiyatı doğru yazar", async () => {
    getPublishedHotelContentMock.mockResolvedValue({
      ...baseContent,
      extras: [
        {
          id: "e1",
          name: "Romantik akşam yemeği",
          unitLabel: "çift başına",
          priceMinor: null,
          currency: "TRY",
          priceOnRequest: true,
        },
      ],
    });
    const facts = await getHotelAiFacts("aurelia-bay");
    expect(facts[0]).toContain("Romantik akşam yemeği");
    expect(facts[0]).toContain("Talep üzerine");
    expect(facts[0]).toContain("çift başına");
  });

  it("özellikleri ve olanak özetini üretir, 50 satırı aşmaz", async () => {
    const manyRooms = Array.from({ length: 80 }, (_, i) => ({
      ...room,
      id: `r${i}`,
      name: `Oda ${i}`,
    }));
    getPublishedHotelContentMock.mockResolvedValue({
      ...baseContent,
      rooms: manyRooms,
      amenities: ["ucretsiz-wifi", "spa-merkezi", "ozel-amenity"],
      specs: {
        ...emptySpecs,
        starRating: 5,
        totalRooms: 200,
        checkInTime: "14:00",
        checkOutTime: "12:00",
      },
    });
    const facts = await getHotelAiFacts("aurelia-bay");
    expect(facts.length).toBeLessThanOrEqual(50);
    expect(facts[0]).toContain("5 yıldızlı");
    expect(facts[0]).toContain("200 odalı");
    expect(facts.some((f) => f.includes("Check-in saati: 14:00"))).toBe(true);
    // Katalog etiketi çözümlenir, özel anahtar olduğu gibi kalır
    expect(facts.some((f) => f.includes("Ücretsiz Wi-Fi") && f.includes("ozel-amenity"))).toBe(true);
  });

  it("repo hatasında boş dizi döner (misafir akışı bozulmaz)", async () => {
    getPublishedHotelContentMock.mockRejectedValue(new Error("db down"));
    const facts = await getHotelAiFacts("aurelia-bay");
    expect(facts).toEqual([]);
  });

  it("indirimli oda fiyatını ve fiyat notunu yazar", async () => {
    getPublishedHotelContentMock.mockResolvedValue({
      ...baseContent,
      rooms: [
        {
          ...room,
          boardType: "kahvalti-dahil",
          unitCount: 40,
          discountPercent: 10,
          discountLabel: "Erken rezervasyon",
          pricingNotes: "3. kişi +800 TL/gece.",
        },
      ],
    });
    const facts = await getHotelAiFacts("aurelia-bay");
    const roomFact = facts.find((f) => f.startsWith("Oda:"));
    expect(roomFact).toContain("Kahvaltı dahil");
    expect(roomFact).toContain("40 adet");
    expect(roomFact).toContain("%10 indirimli");
    expect(roomFact).toContain("normal");
    expect(facts.some((f) => f.includes("fiyat notu: 3. kişi"))).toBe(true);
  });

  it("bugüne denk gelen dönem fiyatını kullanır ve dönem özetini ekler", async () => {
    getPublishedHotelContentMock.mockResolvedValue({
      ...baseContent,
      rooms: [
        {
          ...room,
          rates: [
            {
              id: "rate1",
              name: "Sürekli Dönem",
              startDate: "2000-01-01",
              endDate: "2099-12-31",
              priceMinor: 620000,
              currency: "TRY",
              minStayNights: 2,
            },
          ],
        },
      ],
    });
    const facts = await getHotelAiFacts("aurelia-bay");
    const roomFact = facts.find((f) => f.startsWith("Oda:"));
    expect(roomFact).toContain("6.200");
    expect(roomFact).toContain("en az 2 gece");
    expect(facts.some((f) => f.includes("dönem fiyatları") && f.includes("Sürekli Dönem"))).toBe(
      true,
    );
  });

  it("politika ve iletişim satırlarını üretir", async () => {
    getPublishedHotelContentMock.mockResolvedValue({
      ...baseContent,
      specs: {
        ...emptySpecs,
        cancellationPolicy: "48 saat öncesine kadar ücretsiz iptal.",
        childPolicy: "0-6 yaş ücretsiz.",
        petsAllowed: false,
        paymentMethods: ["nakit", "kredi-karti"],
        address: "Aurelia Koyu No:1",
        phone: "+385 20 555 0100",
        airportDistanceKm: 35,
      },
    });
    const facts = await getHotelAiFacts("aurelia-bay");
    expect(facts.some((f) => f.includes("İptal politikası: 48 saat"))).toBe(true);
    expect(facts.some((f) => f.includes("Çocuk politikası: 0-6 yaş"))).toBe(true);
    expect(facts.some((f) => f.includes("Evcil hayvan kabul edilmez"))).toBe(true);
    expect(facts.some((f) => f.includes("Nakit, Kredi kartı"))).toBe(true);
    expect(facts.some((f) => f.includes("Havalimanına uzaklık: 35 km"))).toBe(true);
  });

  it("indirimli ekstra fiyatını yazar", async () => {
    getPublishedHotelContentMock.mockResolvedValue({
      ...baseContent,
      extras: [
        {
          id: "e2",
          name: "Spa paketi",
          unitLabel: "kişi başı",
          priceMinor: 280000,
          currency: "TRY",
          priceOnRequest: false,
          discountPercent: 15,
          discountLabel: "Misafire özel",
        },
      ],
    });
    const facts = await getHotelAiFacts("aurelia-bay");
    expect(facts[0]).toContain("Spa paketi");
    expect(facts[0]).toContain("%15 indirimli");
    expect(facts[0]).toContain("2.380"); // 2.800 * 0.85
  });
});

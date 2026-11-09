import { describe, expect, it } from "vitest";
import {
  describeStay,
  overlapsClosedRange,
  parseStaySearch,
  quoteStay,
  roomCapacityFit,
  withStayQuery,
  type QuoteRoom,
} from "./stay-search";

function room(overrides: Partial<QuoteRoom> & Pick<QuoteRoom, "id" | "slug">): QuoteRoom {
  return {
    name: overrides.slug,
    imageUrl: null,
    boardType: null,
    capacityAdults: 2,
    capacityChildren: 2,
    priceMinor: 100_000,
    currency: "TRY",
    priceOnRequest: false,
    discountPercent: null,
    discountLabel: null,
    minStayNights: null,
    rates: [],
    ...overrides,
  };
}

describe("parseStaySearch", () => {
  it("geçerli tarih, yetişkin ve çocuk yaşlarını okur", () => {
    const stay = parseStaySearch({ giris: "2026-12-10", cikis: "2026-12-13", yetiskin: "3", cocuk: "4, 9" });
    expect(stay).toEqual({ checkIn: "2026-12-10", checkOut: "2026-12-13", adults: 3, childAges: [4, 9], hasParty: true });
  });

  it("ters ya da bozuk tarihleri ve geçersiz yaşları yok sayar", () => {
    const stay = parseStaySearch(new URLSearchParams("giris=2026-12-13&cikis=2026-12-10&cocuk=a,30,5"));
    expect(stay.checkIn).toBeNull();
    expect(stay.checkOut).toBeNull();
    expect(stay.childAges).toEqual([17, 5]);
    expect(stay.adults).toBe(2);
  });

  it("kişi bilgisi yoksa hasParty false olur", () => {
    expect(parseStaySearch({}).hasParty).toBe(false);
  });
});

describe("withStayQuery / describeStay", () => {
  it("var olan parametreleri koruyarak konaklama bilgisini ekler", () => {
    const stay = parseStaySearch({ giris: "2026-12-10", cikis: "2026-12-13", yetiskin: "2", cocuk: "6" });
    expect(withStayQuery("/talep?hotel=x", stay)).toBe(
      "/talep?hotel=x&giris=2026-12-10&cikis=2026-12-13&yetiskin=2&cocuk=6",
    );
    expect(describeStay(stay)).toBe("10 Ara – 13 Ara · 3 gece · 2 yetişkin, 1 çocuk");
  });

  it("arama boşsa bağlantıyı değiştirmez", () => {
    expect(withStayQuery("/termal/oteller/x", parseStaySearch({}))).toBe("/termal/oteller/x");
  });
});

describe("roomCapacityFit", () => {
  const party = (adults: number, childAges: number[] = []) => ({ adults, childAges });
  it("yetişkin kapasitesi aşılınca uygun değildir", () => {
    expect(roomCapacityFit({ capacityAdults: 2, capacityChildren: 1 }, party(3))).toBe("no");
  });
  it("çocuk kapasitesi girilmemişse teyit ister", () => {
    expect(roomCapacityFit({ capacityAdults: 2, capacityChildren: 0 }, party(2, [5]))).toBe("confirm");
  });
  it("çocuk kapasitesi yeterliyse uygundur, yetmiyorsa değildir", () => {
    expect(roomCapacityFit({ capacityAdults: 2, capacityChildren: 2 }, party(2, [5, 8]))).toBe("fits");
    expect(roomCapacityFit({ capacityAdults: 2, capacityChildren: 1 }, party(2, [5, 8]))).toBe("no");
  });
});

describe("overlapsClosedRange", () => {
  it("kapalı dönemin son günü de kapalıdır, çıkış günü sayılmaz", () => {
    const closed = [{ startDate: "2026-12-01", endDate: "2026-12-05" }];
    expect(overlapsClosedRange("2026-12-05", "2026-12-07", closed)).toBe(true);
    expect(overlapsClosedRange("2026-11-28", "2026-12-01", closed)).toBe(false);
    expect(overlapsClosedRange("2026-12-06", "2026-12-08", closed)).toBe(false);
  });
});

describe("quoteStay", () => {
  const stay = parseStaySearch({ giris: "2026-12-10", cikis: "2026-12-13", yetiskin: "2" });

  it("her geceyi kendi dönemiyle fiyatlar ve toplar", () => {
    const quote = quoteStay(
      {
        rooms: [
          room({
            id: "r1",
            slug: "standart",
            rates: [{ name: "Yılbaşı", startDate: "2026-12-12", endDate: "2026-12-31", priceMinor: 200_000, currency: "TRY" }],
          }),
        ],
        promotions: [],
        ratePlanPrices: [],
      },
      stay,
      "2026-11-04",
    );
    expect(quote.ok && quote.nights).toBe(3);
    expect(quote.ok && quote.rooms[0].totalMinor).toBe(100_000 + 100_000 + 200_000);
  });

  it("uygun odaları önce, ucuzdan pahalıya sıralar; talep üzerine odanın toplamı yoktur", () => {
    const quote = quoteStay(
      {
        rooms: [
          room({ id: "a", slug: "pahali", priceMinor: 300_000 }),
          room({ id: "b", slug: "kucuk", capacityAdults: 1, priceMinor: 50_000 }),
          room({ id: "c", slug: "talep", priceOnRequest: true, priceMinor: null }),
          room({ id: "d", slug: "ucuz", priceMinor: 80_000 }),
        ],
        promotions: [],
        ratePlanPrices: [],
      },
      stay,
      "2026-11-04",
    );
    if (!quote.ok) throw new Error("beklenmeyen hata");
    expect(quote.rooms.map((r) => r.slug)).toEqual(["ucuz", "pahali", "talep", "kucuk"]);
    expect(quote.rooms.find((r) => r.slug === "talep")?.totalMinor).toBeNull();
  });

  it("talep üzerine odayı dönem fiyatı olan gecelerde fiyatlar, dönem dışı gece varsa fiyatlamaz", () => {
    const winter = [{ name: "Kış", startDate: "2026-12-10", endDate: "2026-12-12", priceMinor: 150_000, currency: "TRY" }];
    const pricing = { rooms: [room({ id: "r1", slug: "talep", priceOnRequest: true, priceMinor: null, rates: winter })], promotions: [], ratePlanPrices: [] };
    const inSeason = quoteStay(pricing, stay, "2026-11-04");
    expect(inSeason.ok && inSeason.rooms[0].totalMinor).toBe(450_000);
    const partly = quoteStay(pricing, parseStaySearch({ giris: "2026-12-11", cikis: "2026-12-14", yetiskin: "2" }), "2026-11-04");
    expect(partly.ok && partly.rooms[0].totalMinor).toBeNull();
  });

  it("kampanya indirimini ve minimum konaklama eksiğini bildirir", () => {
    const quote = quoteStay(
      {
        rooms: [room({ id: "r1", slug: "standart", minStayNights: 5 })],
        promotions: [{ name: "Erken rezervasyon", discountPercent: 10, validFrom: null, validTo: null, minNights: null, roomIds: [], isActive: true }],
        ratePlanPrices: [],
      },
      stay,
      "2026-11-04",
    );
    if (!quote.ok) throw new Error("beklenmeyen hata");
    expect(quote.rooms[0]).toMatchObject({
      totalMinor: 270_000,
      originalTotalMinor: 300_000,
      discountLabel: "Erken rezervasyon",
      minStayShortfall: 5,
    });
  });

  it("geçmiş tarih ya da eksik tarih hata döner", () => {
    expect(quoteStay({ rooms: [], promotions: [], ratePlanPrices: [] }, stay, "2026-12-11").ok).toBe(false);
    expect(quoteStay({ rooms: [], promotions: [], ratePlanPrices: [] }, parseStaySearch({}), "2026-11-04").ok).toBe(false);
  });
});

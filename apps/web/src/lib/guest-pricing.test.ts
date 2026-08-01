// ---------------------------------------------------------------------------
// Misafir fiyat çözümleme testleri — yaş bazlı çocuk fiyatlandırma dahil
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { resolveGuestRoomPrice, type GuestRoomPricingInput } from "./guest-pricing";

function baseInput(overrides: Partial<GuestRoomPricingInput> = {}): GuestRoomPricingInput {
  return {
    room: {
      id: "room-1",
      priceMinor: 400000,
      currency: "TRY",
      priceOnRequest: false,
      discountPercent: null,
      discountLabel: null,
      childAgePrices: [],
    },
    rates: [],
    ...overrides,
  };
}

describe("resolveGuestRoomPrice — çocuk yaşı olmadan", () => {
  it("baz fiyatı olduğu gibi döner", () => {
    const result = resolveGuestRoomPrice(baseInput());
    expect(result.priceMinor).toBe(400000);
    expect(result.childBreakdown).toBeUndefined();
  });
});

describe("resolveGuestRoomPrice — çocuk yaşı ile (oda varsayılanı)", () => {
  it("eşleşme yoksa çocuk yetişkin fiyatından ücretlendirilir", () => {
    const input = baseInput({ childAges: [10] });
    const result = resolveGuestRoomPrice(input);
    expect(result.childBreakdown).toEqual([{ age: 10, priceMinor: 400000 }]);
    expect(result.priceMinor).toBe(800000);
  });

  it("ücretsiz bant için ek ücret alınmaz", () => {
    const input = baseInput({
      room: {
        id: "room-1",
        priceMinor: 400000,
        currency: "TRY",
        priceOnRequest: false,
        discountPercent: null,
        discountLabel: null,
        childAgePrices: [{ ageFrom: 0, ageTo: 6, mode: "ucretsiz" }],
      },
      childAges: [3],
    });
    const result = resolveGuestRoomPrice(input);
    expect(result.childBreakdown).toEqual([{ age: 3, priceMinor: 0 }]);
    expect(result.priceMinor).toBe(400000);
  });

  it("sabit tutar bandı doğru eklenir", () => {
    const input = baseInput({
      room: {
        id: "room-1",
        priceMinor: 400000,
        currency: "TRY",
        priceOnRequest: false,
        discountPercent: null,
        discountLabel: null,
        childAgePrices: [{ ageFrom: 7, ageTo: 12, mode: "sabit", priceMinor: 50000 }],
      },
      childAges: [8],
    });
    const result = resolveGuestRoomPrice(input);
    expect(result.childBreakdown).toEqual([{ age: 8, priceMinor: 50000 }]);
    expect(result.priceMinor).toBe(450000);
  });

  it("yüzde bandı yetişkin gecelik fiyatına göre hesaplanır", () => {
    const input = baseInput({
      room: {
        id: "room-1",
        priceMinor: 400000,
        currency: "TRY",
        priceOnRequest: false,
        discountPercent: null,
        discountLabel: null,
        childAgePrices: [{ ageFrom: 13, ageTo: 17, mode: "yuzde", percent: 50 }],
      },
      childAges: [15],
    });
    const result = resolveGuestRoomPrice(input);
    expect(result.childBreakdown).toEqual([{ age: 15, priceMinor: 200000 }]);
    expect(result.priceMinor).toBe(600000);
  });

  it("birden fazla çocuk için ayrı ayrı hesaplanıp toplanır", () => {
    const input = baseInput({
      room: {
        id: "room-1",
        priceMinor: 400000,
        currency: "TRY",
        priceOnRequest: false,
        discountPercent: null,
        discountLabel: null,
        childAgePrices: [
          { ageFrom: 0, ageTo: 6, mode: "ucretsiz" },
          { ageFrom: 7, ageTo: 12, mode: "sabit", priceMinor: 50000 },
        ],
      },
      childAges: [4, 8, 15],
    });
    const result = resolveGuestRoomPrice(input);
    expect(result.childBreakdown).toEqual([
      { age: 4, priceMinor: 0 },
      { age: 8, priceMinor: 50000 },
      { age: 15, priceMinor: 400000 },
    ]);
    expect(result.childSurchargeMinor).toBe(450000);
    expect(result.priceMinor).toBe(850000);
  });
});

describe("resolveGuestRoomPrice — dönem bazlı çocuk fiyatı odayı ezer", () => {
  it("dönemde çocuk fiyatı tanımlıysa oda varsayılanı yerine o kullanılır", () => {
    const input = baseInput({
      room: {
        id: "room-1",
        priceMinor: 400000,
        currency: "TRY",
        priceOnRequest: false,
        discountPercent: null,
        discountLabel: null,
        childAgePrices: [{ ageFrom: 0, ageTo: 17, mode: "ucretsiz" }],
      },
      rates: [
        {
          name: "Yaz 2026",
          startDate: "2026-06-01",
          endDate: "2026-09-01",
          priceMinor: 500000,
          currency: "TRY",
          childAgePrices: [{ ageFrom: 0, ageTo: 17, mode: "sabit", priceMinor: 75000 }],
        },
      ],
      date: "2026-07-01",
      childAges: [9],
    });
    const result = resolveGuestRoomPrice(input);
    expect(result.rateName).toBe("Yaz 2026");
    expect(result.childBreakdown).toEqual([{ age: 9, priceMinor: 75000 }]);
    expect(result.priceMinor).toBe(575000);
  });

  it("dönemde çocuk fiyatı tanımlı değilse oda varsayılanı kullanılır", () => {
    const input = baseInput({
      room: {
        id: "room-1",
        priceMinor: 400000,
        currency: "TRY",
        priceOnRequest: false,
        discountPercent: null,
        discountLabel: null,
        childAgePrices: [{ ageFrom: 0, ageTo: 17, mode: "ucretsiz" }],
      },
      rates: [
        {
          name: "Yaz 2026",
          startDate: "2026-06-01",
          endDate: "2026-09-01",
          priceMinor: 500000,
          currency: "TRY",
        },
      ],
      date: "2026-07-01",
      childAges: [9],
    });
    const result = resolveGuestRoomPrice(input);
    expect(result.childBreakdown).toEqual([{ age: 9, priceMinor: 0 }]);
    expect(result.priceMinor).toBe(500000);
  });
});

describe("resolveGuestRoomPrice — talep üzerine fiyatlarda çocuk hesaplanmaz", () => {
  it("priceOnRequest true ise childBreakdown eklenmez", () => {
    const input = baseInput({
      room: {
        id: "room-1",
        priceMinor: null,
        currency: "TRY",
        priceOnRequest: true,
        discountPercent: null,
        discountLabel: null,
      },
      childAges: [8],
    });
    const result = resolveGuestRoomPrice(input);
    expect(result.childBreakdown).toBeUndefined();
    expect(result.priceOnRequest).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Kampanya seçimi — misafir lehine olan kazanmalı
// ---------------------------------------------------------------------------

function promo(name: string, discountPercent: number, overrides = {}) {
  return {
    name,
    discountPercent,
    validFrom: null,
    validTo: null,
    minNights: null,
    roomIds: [] as string[],
    isActive: true,
    ...overrides,
  };
}

describe("resolveGuestRoomPrice — kampanya seçimi", () => {
  it("birden fazla aktif kampanyada EN YÜKSEK indirim kazanır (dizi sırası değil)", () => {
    const result = resolveGuestRoomPrice(
      baseInput({
        // Snapshot createdAt ASC sıralı gelir; eskisi başta olsa da yenisi kazanmalı.
        promotions: [promo("Eski kampanya", 10), promo("Erken rezervasyon", 30)],
        date: "2026-07-01",
      }),
    );
    expect(result.promotionName).toBe("Erken rezervasyon");
    expect(result.discountPercent).toBe(30);
    expect(result.priceMinor).toBe(280000);
  });

  it("sırası tersine dönse de sonuç aynı kalır", () => {
    const result = resolveGuestRoomPrice(
      baseInput({
        promotions: [promo("Erken rezervasyon", 30), promo("Eski kampanya", 10)],
        date: "2026-07-01",
      }),
    );
    expect(result.promotionName).toBe("Erken rezervasyon");
  });

  it("uygun olmayan kampanya (minNights) elenir", () => {
    const result = resolveGuestRoomPrice(
      baseInput({
        promotions: [promo("7 gece", 50, { minNights: 7 }), promo("Genel", 10)],
        date: "2026-07-01",
        nights: 2,
      }),
    );
    expect(result.promotionName).toBe("Genel");
  });

  it("pasif kampanya seçilmez", () => {
    const result = resolveGuestRoomPrice(
      baseInput({
        promotions: [promo("Kapalı", 60, { isActive: false })],
        date: "2026-07-01",
      }),
    );
    expect(result.source).toBe("base");
  });
});

// ---------------------------------------------------------------------------
// Çocuk ek ücreti — üstü çizili fiyat tutarlılığı
// ---------------------------------------------------------------------------

describe("resolveGuestRoomPrice — çocuk ücretiyle originalPriceMinor", () => {
  it("normal fiyat indirimli fiyattan düşük görünmez", () => {
    const result = resolveGuestRoomPrice(
      baseInput({
        promotions: [promo("Yaz", 25)],
        date: "2026-07-01",
        childAges: [10],
      }),
    );
    // Yetişkin 400000 → indirimli 300000; çocuk indirimli fiyattan ücretlenir.
    expect(result.priceMinor).toBe(600000);
    expect(result.originalPriceMinor).toBeGreaterThanOrEqual(result.priceMinor as number);
  });

  it("çocuk yokken originalPriceMinor değişmez", () => {
    const result = resolveGuestRoomPrice(
      baseInput({ promotions: [promo("Yaz", 25)], date: "2026-07-01" }),
    );
    expect(result.originalPriceMinor).toBe(400000);
    expect(result.priceMinor).toBe(300000);
  });
});

// ---------------------------------------------------------------------------
// Fiyat planında kişi sayısı
// ---------------------------------------------------------------------------

describe("resolveGuestRoomPrice — fiyat planı occupancyPrices", () => {
  const planPrice = {
    roomId: "room-1",
    name: "BAR Yaz",
    startDate: "2026-06-01",
    endDate: "2026-09-30",
    priceMinor: 500000,
    currency: "TRY",
    minStayNights: null,
    occupancyPrices: [
      { guestCount: 1, priceMinor: 350000 },
      { guestCount: 3, priceMinor: 700000 },
    ],
  };

  it("kişi sayısına göre plan fiyatını çözer", () => {
    const result = resolveGuestRoomPrice(
      baseInput({ ratePlanPrices: [planPrice], date: "2026-07-01", guestCount: 3 }),
    );
    expect(result.source).toBe("rate_plan");
    expect(result.priceMinor).toBe(700000);
  });

  it("eşleşme yoksa plan baz fiyatına düşer", () => {
    const result = resolveGuestRoomPrice(
      baseInput({ ratePlanPrices: [planPrice], date: "2026-07-01", guestCount: 2 }),
    );
    expect(result.priceMinor).toBe(500000);
  });

  it("guestCount verilmezse plan baz fiyatı kullanılır", () => {
    const result = resolveGuestRoomPrice(
      baseInput({ ratePlanPrices: [planPrice], date: "2026-07-01" }),
    );
    expect(result.priceMinor).toBe(500000);
  });
});

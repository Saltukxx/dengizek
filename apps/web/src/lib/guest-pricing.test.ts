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

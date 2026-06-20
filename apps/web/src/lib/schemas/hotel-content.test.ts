// ---------------------------------------------------------------------------
// Otel içerik şema testleri — fiyat kuralları, menü sınırları, saat biçimi
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import {
  extraUpsertSchema,
  hotelSpecsSchema,
  menuItemSchema,
  restaurantUpsertSchema,
  roomRatesPutSchema,
  roomUpsertSchema,
} from "./hotel-content";

describe("roomUpsertSchema", () => {
  const base = { slug: "deluxe", name: "Deluxe" };

  it("varsayılanlarla geçerli", () => {
    const r = roomUpsertSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.priceOnRequest).toBe(true);
      expect(r.data.capacityAdults).toBe(2);
    }
  });

  it("priceOnRequest=false iken fiyatsız reddedilir", () => {
    const r = roomUpsertSchema.safeParse({ ...base, priceOnRequest: false });
    expect(r.success).toBe(false);
  });

  it("priceOnRequest=false + fiyat geçerli", () => {
    const r = roomUpsertSchema.safeParse({
      ...base,
      priceOnRequest: false,
      priceMinor: 450000,
    });
    expect(r.success).toBe(true);
  });

  it("geçersiz slug reddedilir", () => {
    expect(roomUpsertSchema.safeParse({ ...base, slug: "Büyük Oda" }).success).toBe(false);
  });

  it("pansiyon tipi varsayılanı 'sadece-oda', geçersiz tip reddedilir", () => {
    const r = roomUpsertSchema.safeParse(base);
    expect(r.success && r.data.boardType).toBe("sadece-oda");
    expect(roomUpsertSchema.safeParse({ ...base, boardType: "ultra" }).success).toBe(false);
  });

  it("talep üzerine fiyatla indirim reddedilir", () => {
    const r = roomUpsertSchema.safeParse({ ...base, discountPercent: 10 });
    expect(r.success).toBe(false);
  });

  it("fiyat + indirim geçerli, %90 üstü reddedilir", () => {
    const valid = roomUpsertSchema.safeParse({
      ...base,
      priceOnRequest: false,
      priceMinor: 450000,
      discountPercent: 10,
    });
    expect(valid.success).toBe(true);
    const tooMuch = roomUpsertSchema.safeParse({
      ...base,
      priceOnRequest: false,
      priceMinor: 450000,
      discountPercent: 95,
    });
    expect(tooMuch.success).toBe(false);
  });
});

describe("roomRatesPutSchema", () => {
  const rate = {
    name: "Yaz 2026",
    startDate: "2026-06-01",
    endDate: "2026-09-15",
    priceMinor: 620000,
  };

  it("geçerli dönemi kabul eder", () => {
    const r = roomRatesPutSchema.safeParse({ donemler: [rate] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.donemler[0].currency).toBe("TRY");
  });

  it("bitiş < başlangıç reddedilir", () => {
    const r = roomRatesPutSchema.safeParse({
      donemler: [{ ...rate, endDate: "2026-05-01" }],
    });
    expect(r.success).toBe(false);
  });

  it("geçersiz tarih biçimi reddedilir", () => {
    expect(
      roomRatesPutSchema.safeParse({ donemler: [{ ...rate, startDate: "01.06.2026" }] })
        .success,
    ).toBe(false);
  });

  it("40'tan fazla dönem reddedilir", () => {
    const many = Array.from({ length: 41 }, (_, i) => ({ ...rate, name: `D${i}` }));
    expect(roomRatesPutSchema.safeParse({ donemler: many }).success).toBe(false);
  });

  it("dönem fiyatı zorunlu ve pozitif", () => {
    expect(
      roomRatesPutSchema.safeParse({ donemler: [{ ...rate, priceMinor: 0 }] }).success,
    ).toBe(false);
  });

  it("kişi fiyatlarını kabul eder", () => {
    const r = roomRatesPutSchema.safeParse({
      donemler: [
        {
          ...rate,
          occupancyPrices: [
            { guestCount: 2, priceMinor: 620000 },
            { guestCount: 3, priceMinor: 710000 },
          ],
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("aynı kişi sayısı için tekrarlı fiyat reddedilir", () => {
    const r = roomRatesPutSchema.safeParse({
      donemler: [
        {
          ...rate,
          occupancyPrices: [
            { guestCount: 3, priceMinor: 710000 },
            { guestCount: 3, priceMinor: 720000 },
          ],
        },
      ],
    });
    expect(r.success).toBe(false);
  });
});

describe("restaurantUpsertSchema (menü)", () => {
  it("geçerli menüyü kabul eder", () => {
    const r = restaurantUpsertSchema.safeParse({
      name: "Teras",
      menu: [
        {
          id: "s1",
          title: "Başlangıçlar",
          items: [
            {
              id: "m1",
              name: "Çorba",
              currency: "TRY",
              priceOnRequest: false,
              priceMinor: 18000,
              tags: ["vejetaryen"],
            },
          ],
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("bilinmeyen menü etiketi reddedilir", () => {
    const r = menuItemSchema.safeParse({
      id: "m1",
      name: "Çorba",
      tags: ["kosher"],
    });
    expect(r.success).toBe(false);
  });

  it("20'den fazla bölüm reddedilir", () => {
    const sections = Array.from({ length: 21 }, (_, i) => ({
      id: `s${i}`,
      title: `Bölüm ${i}`,
      items: [],
    }));
    expect(restaurantUpsertSchema.safeParse({ name: "X", menu: sections }).success).toBe(
      false,
    );
  });
});

describe("extraUpsertSchema", () => {
  it("kategori varsayılanı 'diger'", () => {
    const r = extraUpsertSchema.safeParse({ name: "Transfer" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.category).toBe("diger");
  });
});

describe("hotelSpecsSchema", () => {
  it("geçerli saat biçimini kabul eder", () => {
    expect(
      hotelSpecsSchema.safeParse({ checkInTime: "14:00", checkOutTime: "12:00" }).success,
    ).toBe(true);
  });

  it("geçersiz saat reddedilir", () => {
    expect(hotelSpecsSchema.safeParse({ checkInTime: "25:00" }).success).toBe(false);
    expect(hotelSpecsSchema.safeParse({ checkInTime: "öğlen" }).success).toBe(false);
  });

  it("politika ve iletişim alanlarını kabul eder", () => {
    const r = hotelSpecsSchema.safeParse({
      cancellationPolicy: "48 saat öncesine kadar ücretsiz iptal.",
      petsAllowed: false,
      paymentMethods: ["nakit", "kredi-karti"],
      contactEmail: "info@otel.com",
      airportDistanceKm: 35,
    });
    expect(r.success).toBe(true);
  });

  it("geçersiz ödeme yöntemi ve e-posta reddedilir", () => {
    expect(hotelSpecsSchema.safeParse({ paymentMethods: ["bitcoin"] }).success).toBe(false);
    expect(hotelSpecsSchema.safeParse({ contactEmail: "gecersiz" }).success).toBe(false);
  });

  it("yıldız 1-5 dışında reddedilir", () => {
    expect(hotelSpecsSchema.safeParse({ starRating: 6 }).success).toBe(false);
    expect(hotelSpecsSchema.safeParse({ starRating: 5 }).success).toBe(true);
  });
});

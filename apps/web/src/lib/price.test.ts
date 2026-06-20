// ---------------------------------------------------------------------------
// Fiyat biçimleyici testleri
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import {
  applyDiscount,
  formatDateRangeTr,
  formatPrice,
  resolveCurrentRate,
  toMajor,
  toMinor,
} from "./price";

describe("formatPrice", () => {
  it("tam TL tutarını kuruşsuz biçimler", () => {
    // Intl çıktısında ayraçlar yereldir; sayı ve simge denetlenir
    const out = formatPrice(450000, "TRY");
    expect(out).toContain("4.500");
    expect(out).toContain("₺");
  });

  it("kuruşlu tutarı iki haneli gösterir", () => {
    expect(formatPrice(18050, "TRY")).toContain("180,5");
  });

  it("talep üzerine için metin döner", () => {
    expect(formatPrice(450000, "TRY", true)).toBe("Talep üzerine");
    expect(formatPrice(null, "TRY")).toBe("Talep üzerine");
    expect(formatPrice(undefined, "EUR")).toBe("Talep üzerine");
  });

  it("euro/dolar biçimler", () => {
    expect(formatPrice(10000, "EUR")).toContain("€");
    expect(formatPrice(10000, "USD")).toContain("$");
  });
});

describe("toMinor / toMajor", () => {
  it("gidiş-dönüş tutarlıdır", () => {
    expect(toMinor(45.5)).toBe(4550);
    expect(toMajor(4550)).toBe(45.5);
    expect(toMinor(toMajor(123456))).toBe(123456);
  });

  it("kayan nokta hatasını yuvarlar", () => {
    expect(toMinor(0.1 + 0.2)).toBe(30);
  });
});

describe("applyDiscount", () => {
  it("yüzdeyi uygular ve yuvarlar", () => {
    expect(applyDiscount(450000, 10)).toBe(405000);
    expect(applyDiscount(280000, 15)).toBe(238000);
    expect(applyDiscount(99999, 33)).toBe(66999); // 66999.33 → yuvarlanır
  });
});

describe("resolveCurrentRate", () => {
  const room = {
    priceMinor: 450000,
    currency: "TRY",
    priceOnRequest: false,
    minStayNights: 1,
  };
  const summer = {
    name: "Yaz",
    startDate: "2026-06-01",
    endDate: "2026-09-15",
    priceMinor: 620000,
    currency: "TRY",
    minStayNights: 2,
  };
  const holiday = {
    name: "Bayram",
    startDate: "2026-07-10",
    endDate: "2026-07-20",
    priceMinor: 800000,
    currency: "TRY",
    minStayNights: null,
  };

  it("tarih döneme düşüyorsa dönem fiyatını döner", () => {
    const r = resolveCurrentRate(room, [summer], "2026-07-01");
    expect(r.priceMinor).toBe(620000);
    expect(r.rateName).toBe("Yaz");
    expect(r.priceOnRequest).toBe(false);
    expect(r.minStayNights).toBe(2);
  });

  it("çakışmada başlangıcı en geç olan dönem kazanır", () => {
    const r = resolveCurrentRate(room, [summer, holiday], "2026-07-15");
    expect(r.priceMinor).toBe(800000);
    expect(r.rateName).toBe("Bayram");
    // Dönem min gece vermemiş → odanın varsayılanı kullanılır
    expect(r.minStayNights).toBe(1);
  });

  it("dönem dışı tarihte baz fiyata döner", () => {
    const r = resolveCurrentRate(room, [summer], "2026-10-01");
    expect(r.priceMinor).toBe(450000);
    expect(r.rateName).toBeUndefined();
  });

  it("baz fiyat talep üzerineyse onu korur, dönem fiyatı talep üzerine olamaz", () => {
    const onRequest = { ...room, priceMinor: null, priceOnRequest: true };
    expect(resolveCurrentRate(onRequest, [], "2026-07-01").priceOnRequest).toBe(true);
    expect(resolveCurrentRate(onRequest, [summer], "2026-07-01").priceOnRequest).toBe(false);
  });
});

describe("formatDateRangeTr", () => {
  it("aynı yılda yılı bir kez yazar", () => {
    const out = formatDateRangeTr("2026-06-01", "2026-09-15");
    expect(out).toContain("1 Haziran");
    expect(out).toContain("15 Eylül 2026");
    expect(out.indexOf("2026")).toBe(out.lastIndexOf("2026"));
  });

  it("yıl değişiminde iki yılı da yazar", () => {
    const out = formatDateRangeTr("2026-11-01", "2027-03-31");
    expect(out).toContain("2026");
    expect(out).toContain("2027");
  });
});

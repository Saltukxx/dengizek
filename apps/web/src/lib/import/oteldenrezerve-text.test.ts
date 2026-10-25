import { describe, expect, it } from "vitest";
import {
  CHECK_IN_LABELS,
  CHECK_OUT_LABELS,
  boardTypeOf,
  cleanText,
  fixCaps,
  petsAllowedOf,
  roomFacts,
  shortDescriptionOf,
  timeAfter,
} from "@/lib/import/oteldenrezerve-text";

describe("giriş/çıkış saati", () => {
  it.each([
    ["*Giriş saati 14:00 çıkış saati ise 12:00 dir.", "14:00", "12:00"],
    ["Odalarına giriş, saat 15.00'ten itibaren başlar. Odalardan çıkış saati ise en geç 12.00'dir.", "15:00", "12:00"],
    ["Otel C/In saati 14:00 olup C/Out saati 12:00 dir.", "14:00", "12:00"],
    ["Check-in 14:00, check-out 11:00.", "14:00", "11:00"],
  ])("%s", (text, checkIn, checkOut) => {
    expect(timeAfter(text, CHECK_IN_LABELS)).toBe(checkIn);
    expect(timeAfter(text, CHECK_OUT_LABELS)).toBe(checkOut);
  });

  it("saat yoksa boş kalır", () => {
    expect(timeAfter("Tesis yıl boyu açıktır.", CHECK_IN_LABELS)).toBeNull();
  });
});

describe("evcil hayvan kuralı yalnız ilgili cümleden okunur", () => {
  it.each([
    ["*Evcil hayvan tesisimizde kabul edilmemektedir.", false],
    ["Giriş saat 15.00'ten itibaren başlar. Tesise evcil hayvan kabul edilmiyor. Rezervasyon kabul edilir.", false],
    ["Küçük ırk evcil hayvanlar kabul edilir.", true],
    ["Havuz 09:00'da açılır.", null],
  ])("%s", (text, expected) => {
    expect(petsAllowedOf(text)).toBe(expected);
  });
});

describe("oda bilgisi", () => {
  it("kapasite ve metrekare", () => {
    expect(roomFacts("Oda Büyüklüğü: 28 m²\nKapasite: Maksimum 2 yetişkin + 1 çocuk (2+1)")).toEqual({
      capacityAdults: 2,
      capacityChildren: 1,
      sizeSqm: 28,
    });
    expect(roomFacts("Geniş ve ferah oda")).toEqual({ capacityAdults: null, capacityChildren: null, sizeSqm: null });
  });

  it.each([
    ["Yarım Pansiyon", "yarim-pansiyon"],
    ["Yarım Pansiyon Plus", "yarim-pansiyon"],
    ["Half Board", "yarim-pansiyon"],
    ["Oda Kahvaltı", "kahvalti-dahil"],
    ["Sadece Oda", "sadece-oda"],
    ["Her Şey Dahil", "hersey-dahil"],
    ["TERMAL", null],
  ])("pansiyon: %s", (label, expected) => {
    expect(boardTypeOf(label)).toBe(expected);
  });
});

describe("metin temizliği", () => {
  it("eski marka cümlesini ve SEO anahtar kelime satırını çıkarır", () => {
    const text = [
      "Şifalı termal suları ile öne çıkar. Oteldenrezerve Resmi Siteden Güvenli Rezervasyon İmkanı!",
      "afyon otel, afyon termal, termal fiyat, termal rezervasyon, oruçoğlu termal, oruçoğlu otel, oruçoğlu fiyat",
      "Kapalı havuz mevcuttur.",
    ].join("\n");
    expect(cleanText(text)).toBe("Şifalı termal suları ile öne çıkar.\nKapalı havuz mevcuttur.");
  });

  it("tamamı büyük harf adları Türkçe kurala göre düzeltir, kaymış büyük harfi düzeltir", () => {
    expect(fixCaps("ORUÇOĞLU THERMAL HOTEL")).toBe("Oruçoğlu Thermal Hotel");
    expect(fixCaps("AİLE ODASI")).toBe("Aile Odası");
    expect(fixCaps("Deluxe ODa")).toBe("Deluxe Oda");
    expect(fixCaps("Kral SUit")).toBe("Kral Suit");
    expect(fixCaps("Deluxe Oda SPA")).toBe("Deluxe Oda SPA");
    expect(fixCaps("McDonald Suit")).toBe("McDonald Suit");
  });

  it("kısa açıklama başlık satırını atlar", () => {
    expect(shortDescriptionOf("X Otel | Şifalı Tatilin Adresi\nX Otel köklü bir termal oteldir. Havuzları vardır.")).toBe(
      "X Otel köklü bir termal oteldir. Havuzları vardır.",
    );
  });
});

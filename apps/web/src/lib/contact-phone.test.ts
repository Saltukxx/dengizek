import { describe, expect, it } from "vitest";
import { hotelContactLinks, normalizePhone } from "./contact-phone";

describe("normalizePhone", () => {
  it.each([
    ["0 (532) 111 22 33", "905321112233"],
    ["+90 532 111 22 33", "905321112233"],
    ["5321112233", "905321112233"],
    ["0272 215 00 00", "902722150000"],
    ["0049 30 1234567", "49301234567"],
    ["+385 20 555 0100", "385205550100"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it("çok kısa ya da boş değer için null döner", () => {
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

describe("hotelContactLinks", () => {
  it("cep telefonu WhatsApp için de kullanılır; mesajda otel adı geçer", () => {
    const links = hotelContactLinks({ phone: "0532 111 22 33", whatsapp: null }, "Ilıca Otel");
    expect(links.tel).toBe("tel:+905321112233");
    expect(links.whatsapp).toBe(
      `https://wa.me/905321112233?text=${encodeURIComponent("Merhaba, Otelsayfam'daki Ilıca Otel sayfasından yazıyorum.")}`,
    );
  });

  it("sabit hat WhatsApp'a bağlanmaz; ayrı WhatsApp numarası önceliklidir", () => {
    expect(hotelContactLinks({ phone: "0272 215 00 00", whatsapp: null }, "X").whatsapp).toBeNull();
    expect(hotelContactLinks({ phone: "0272 215 00 00", whatsapp: "0533 000 00 00" }, "X").whatsapp).toContain("wa.me/905330000000");
  });
});

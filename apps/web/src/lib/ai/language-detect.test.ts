import { describe, expect, it } from "vitest";
import { detectLanguageHint } from "@/lib/ai/language-detect";

describe("detectLanguageHint", () => {
  it("boş mesajda undefined döner", () => {
    expect(detectLanguageHint("")).toBeUndefined();
    expect(detectLanguageHint("   ")).toBeUndefined();
  });

  it("Türkçe'ye özgü karakter içeren mesajı 'tr' olarak tespit eder", () => {
    expect(detectLanguageHint("Merhaba, check-in saatiniz kaçta?")).toBe("tr");
    expect(detectLanguageHint("Havuz nerede?")).toBe("tr");
  });

  it("İngilizce stopword ağırlıklı mesajı 'en' olarak tespit eder", () => {
    expect(detectLanguageHint("Hello, what is the price for this room please?")).toBe("en");
    expect(detectLanguageHint("Can you help me with the booking?")).toBe("en");
  });

  it("Türkçe stopword ağırlıklı ama özel karaktersiz mesajı da 'tr' tespit eder", () => {
    expect(detectLanguageHint("bu oda var mi")).toBe("tr");
  });

  it("belirsiz kısa mesajda browserLocale ipucuna düşer", () => {
    expect(detectLanguageHint("42", "de-DE")).toBe("de");
    expect(detectLanguageHint("42")).toBeUndefined();
  });

  it("Türkçe karakter varken browserLocale'i yok sayar (asla otoriter değil)", () => {
    expect(detectLanguageHint("Şu oda müsait mi?", "en-US")).toBe("tr");
  });
});

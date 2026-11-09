import { describe, expect, it } from "vitest";
import { MAX_SPEECH_CHARS, prepareSpeechText, splitLong, takeSentences } from "./speech-text";

describe("prepareSpeechText", () => {
  it("TL ve ₺ 'lira' olarak okunur", () => {
    expect(prepareSpeechText("Gecelik 12.500 TL.")).toBe("Gecelik 12.500 lira.");
    expect(prepareSpeechText("Gecelik 12.500 ₺.")).toBe("Gecelik 12.500 lira.");
    expect(prepareSpeechText("Gecelik ₺12.500.")).toBe("Gecelik 12.500 lira.");
  });

  it("saat 'on dört sıfır sıfır' diye okunmasın", () => {
    expect(prepareSpeechText("Giriş 14:00, çıkış 11:30.")).toBe("Giriş 14, çıkış 11 30.");
    expect(prepareSpeechText("Kahvaltı 09:00'da.")).toBe("Kahvaltı 9'da.");
  });

  it("sayı aralığı dile göre okunur", () => {
    expect(prepareSpeechText("Oda 2-4 kişiliktir.")).toBe("Oda 2 ila 4 kişiliktir.");
    expect(prepareSpeechText("Sleeps 2–4 guests.", "en")).toBe("Sleeps 2 to 4 guests.");
  });

  it("markdown, bağlantı ve emoji okunmaz", () => {
    expect(prepareSpeechText("**Kahvaltı** dahil 🍳")).toBe("Kahvaltı dahil");
    expect(prepareSpeechText("Ayrıntı: [rezervasyon sayfası](https://x.com/a) ve www.otel.com")).toBe(
      "Ayrıntı: rezervasyon sayfası ve",
    );
    expect(prepareSpeechText("- Havuz\n- Spa")).toBe("Havuz\nSpa");
  });

  it("ondalık ve binlik ayırıcılara dokunmaz", () => {
    expect(prepareSpeechText("1.250,50 TL")).toBe("1.250,50 lira");
  });
});

describe("takeSentences", () => {
  it("akış sürerken yalnız biten cümleler alınır", () => {
    const text = "Kahvaltı dahildir. Havuz saat on";
    const { ready, consumed } = takeSentences(text, false);
    expect(ready).toEqual(["Kahvaltı dahildir."]);
    expect(text.slice(consumed)).toBe(" Havuz saat on");
  });

  it("cevap bitince kalan parça da okunur", () => {
    expect(takeSentences("Evet! Havuz açık", true)).toEqual({ ready: ["Evet!", "Havuz açık"], consumed: 16 });
  });

  it("'12.500' gibi sayılar ve akışta yarım kalan nokta cümleyi bölmez", () => {
    expect(takeSentences("Fiyat 12.500 lira. Sonra", false).ready).toEqual(["Fiyat 12.500 lira."]);
    expect(takeSentences("Fiyat 12.", false).ready).toEqual([]);
  });

  it("satır sonu da cümle sonudur", () => {
    expect(takeSentences("Havuz\nSpa\n", false).ready).toEqual(["Havuz", "Spa"]);
  });

  it("çok uzun cümle sınırı aşmayacak şekilde bölünür", () => {
    const long = Array.from({ length: 80 }, (_, i) => `kelime${i}`).join(", ") + ".";
    const pieces = splitLong(long);
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) expect(piece.length).toBeLessThanOrEqual(MAX_SPEECH_CHARS);
    expect(pieces.join(" ").replace(/\s+/g, " ")).toBe(long);
  });
});

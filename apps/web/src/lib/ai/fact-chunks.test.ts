import { describe, expect, it } from "vitest";
import { CHUNK_MAX, chunkFactText } from "@/lib/ai/fact-chunks";

describe("uzun otel metinlerini bölme", () => {
  it("kısa metin olduğu gibi kalır (başlık ayrılmaz)", () => {
    expect(chunkFactText("Yeme İçme: Sabah kahvaltısı açık büfedir.")).toEqual({ chunks: ["Yeme İçme: Sabah kahvaltısı açık büfedir."] });
  });

  it("uzun metin başlığı korunarak satır/cümle sınırından bölünür", () => {
    const lines = Array.from({ length: 30 }, (_, i) => `Yer ${i + 1} Merkezi'ne ${i + 10} km`);
    const { title, chunks } = chunkFactText(`Otel Konum: ${lines.join("\n")}`);
    expect(title).toBe("Otel Konum");
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= CHUNK_MAX)).toBe(true);
    // Hiçbir satır kaybolmaz ya da ikiye bölünmez.
    expect(chunks.join("\n").split("\n")).toEqual(lines);
  });

  it("madde işaretleri ayrı parça sayılır", () => {
    const text = `Havuz - Plaj: ${"Açık havuz yaz aylarında hizmet verir. ".repeat(10)}• Kapalı termal havuz 34 derecedir. • Havuz bezi zorunludur.`;
    const { chunks } = chunkFactText(text);
    expect(chunks.join("\n")).toContain("Kapalı termal havuz 34 derecedir.");
    expect(chunks.join("\n")).not.toContain("•");
  });

  it("tek çok uzun cümle kelime sınırından bölünür", () => {
    const { chunks } = chunkFactText(`Not: ${"uzun kelime ".repeat(80)}`);
    expect(chunks.every((c) => c.length <= CHUNK_MAX)).toBe(true);
    expect(chunks.join(" ").split(/\s+/).length).toBe(160);
  });

  it("parça alt başlıkla bitmez: başlık sonraki parçaya geçer", () => {
    const lines = [...Array.from({ length: 14 }, (_, i) => `Gezilecek Yer ${i + 1} : ${i + 20} km`), "Havalimanı", "Nevşehir Kapadokya Havalimanı: 88 km", "Otogar : 2 km"];
    const { chunks } = chunkFactText(`Otel Konum: ${lines.join("\n")}`);
    const withAirport = chunks.find((c) => c.includes("88 km"))!;
    expect(withAirport.split("\n")).toContain("Havalimanı");
    expect(chunks.every((c) => !c.endsWith("Havalimanı"))).toBe(true);
  });
});

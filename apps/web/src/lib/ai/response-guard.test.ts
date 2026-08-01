import { describe, expect, it, vi } from "vitest";
import type { TextStreamPart, ToolSet } from "ai";
import {
  GUARD_FALLBACK_MESSAGE,
  buildToolHintPrompt,
  createGuardStreamTransform,
  decideToolChoice,
  detectToolHints,
  textContainsPriceLikeContent,
} from "@/lib/ai/response-guard";

type Chunk = TextStreamPart<ToolSet>;

async function runTransform(
  flags: { hadPriceTool: boolean; hadFactTool: boolean },
  chunks: Chunk[],
  onGuardTriggered?: (info: { originalLength: number }) => void,
): Promise<Chunk[]> {
  const ts = createGuardStreamTransform(flags, onGuardTriggered)();
  const writer = ts.writable.getWriter();
  const readerPromise = (async () => {
    const out: Chunk[] = [];
    const reader = ts.readable.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      out.push(value);
    }
    return out;
  })();
  for (const c of chunks) await writer.write(c);
  await writer.close();
  return readerPromise;
}

function deltaTexts(chunks: Chunk[]): string[] {
  return chunks
    .filter((c): c is Extract<Chunk, { type: "text-delta" }> => c.type === "text-delta")
    .map((c) => c.text);
}

describe("textContainsPriceLikeContent", () => {
  it("₺ ve TL patternlerini yakalar", () => {
    expect(textContainsPriceLikeContent("Gecelik 4500 ₺")).toBe(true);
    expect(textContainsPriceLikeContent("4500 TL")).toBe(true);
    expect(textContainsPriceLikeContent("Merhaba, hoş geldiniz.")).toBe(false);
  });
});

describe("createGuardStreamTransform", () => {
  it("tek delta'da gelen fiyatlı metni engeller ve gerçek uzunluğu bildirir", async () => {
    const onGuardTriggered = vi.fn();
    const original = "Gecelik 4500 ₺";
    const out = await runTransform(
      { hadPriceTool: false, hadFactTool: false },
      [
        { type: "text-start", id: "1" },
        { type: "text-delta", id: "1", text: original },
        { type: "text-end", id: "1" },
      ],
      onGuardTriggered,
    );
    expect(deltaTexts(out)).toEqual([` ${GUARD_FALLBACK_MESSAGE}`]);
    expect(onGuardTriggered).toHaveBeenCalledWith({ originalLength: original.length });
  });

  it("fiyat pattern'i iki delta'ya bölünse bile kayan pencerede yakalar (streaming-buffer edge case)", async () => {
    const onGuardTriggered = vi.fn();
    const out = await runTransform(
      { hadPriceTool: false, hadFactTool: false },
      [
        { type: "text-start", id: "1" },
        { type: "text-delta", id: "1", text: "Gecelik fiyatımız 45" },
        { type: "text-delta", id: "1", text: "00 ₺ civarında." },
        { type: "text-end", id: "1" },
      ],
      onGuardTriggered,
    );
    // İlk delta akmıştır (henüz fiyat pattern'i tamamlanmadı), ikinci
    // delta'da pattern tamamlanınca guard devreye girer ve akışı keser.
    expect(deltaTexts(out)).toEqual(["Gecelik fiyatımız 45", ` ${GUARD_FALLBACK_MESSAGE}`]);
    expect(onGuardTriggered).toHaveBeenCalledTimes(1);
  });

  it("tetiklendikten sonra aynı blokta gelen ek delta'ları da bastırır", async () => {
    const out = await runTransform(
      { hadPriceTool: false, hadFactTool: false },
      [
        { type: "text-start", id: "1" },
        { type: "text-delta", id: "1", text: "4500 ₺" },
        { type: "text-delta", id: "1", text: " ve devamı yazı." },
        { type: "text-end", id: "1" },
      ],
    );
    expect(deltaTexts(out)).toEqual([` ${GUARD_FALLBACK_MESSAGE}`]);
  });

  it("getRoomPrice çağrıldıysa fiyatlı metne dokunmaz", async () => {
    const original = "Gecelik 4500 ₺ tutuyor.";
    const out = await runTransform(
      { hadPriceTool: true, hadFactTool: false },
      [
        { type: "text-start", id: "1" },
        { type: "text-delta", id: "1", text: original },
        { type: "text-end", id: "1" },
      ],
    );
    expect(deltaTexts(out)).toEqual([original]);
  });

  it("fiyatsız metne dokunmaz ve guard tetiklenmez", async () => {
    const onGuardTriggered = vi.fn();
    const out = await runTransform(
      { hadPriceTool: false, hadFactTool: false },
      [
        { type: "text-start", id: "1" },
        { type: "text-delta", id: "1", text: "Merhaba, hoş geldiniz." },
        { type: "text-end", id: "1" },
      ],
      onGuardTriggered,
    );
    expect(deltaTexts(out)).toEqual(["Merhaba, hoş geldiniz."]);
    expect(onGuardTriggered).not.toHaveBeenCalled();
  });

  it("yeni metin bloğu (text-start) önceki bloğun bastırma durumunu sıfırlar", async () => {
    const out = await runTransform(
      { hadPriceTool: false, hadFactTool: false },
      [
        { type: "text-start", id: "1" },
        { type: "text-delta", id: "1", text: "4500 ₺" },
        { type: "text-end", id: "1" },
        { type: "text-start", id: "2" },
        { type: "text-delta", id: "2", text: "Merhaba tekrar." },
        { type: "text-end", id: "2" },
      ],
    );
    expect(deltaTexts(out)).toEqual([` ${GUARD_FALLBACK_MESSAGE}`, "Merhaba tekrar."]);
  });
});

describe("detectToolHints", () => {
  it("fiyat ve fact ipuçları üretir", () => {
    const hints = detectToolHints("Gecelik fiyat ve iptal politikası nedir?");
    expect(hints.needsPriceTool).toBe(true);
    expect(hints.needsFactTool).toBe(true);
    expect(buildToolHintPrompt(hints)).toContain("getRoomPrice");
    expect(buildToolHintPrompt(hints)).toContain("citeFact");
  });
});

describe("decideToolChoice", () => {
  const noFlags = { hadPriceTool: false, hadFactTool: false };

  it("fiyat ipucu varsa ve henüz çağrılmadıysa getRoomPrice'ı zorlar", () => {
    expect(decideToolChoice({ needsPriceTool: true, needsFactTool: false }, noFlags)).toEqual({
      type: "tool",
      toolName: "getRoomPrice",
    });
  });

  it("fact ipucu varsa ve henüz çağrılmadıysa citeFact'i zorlar", () => {
    expect(decideToolChoice({ needsPriceTool: false, needsFactTool: true }, noFlags)).toEqual({
      type: "tool",
      toolName: "citeFact",
    });
  });

  it("her iki ipucu da varsa fiyat önceliklidir", () => {
    expect(decideToolChoice({ needsPriceTool: true, needsFactTool: true }, noFlags)).toEqual({
      type: "tool",
      toolName: "getRoomPrice",
    });
  });

  it("tool zaten çağrıldıysa tekrar zorlamaz", () => {
    expect(
      decideToolChoice({ needsPriceTool: true, needsFactTool: false }, { hadPriceTool: true, hadFactTool: false }),
    ).toBeUndefined();
  });

  it("hiçbir ipucu yoksa undefined döner (serbest seçim)", () => {
    expect(decideToolChoice({ needsPriceTool: false, needsFactTool: false }, noFlags)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Çok dillilik: motor İngilizce yanıt verebildiğine göre araç yönlendirmesi de
// İngilizce sorularda çalışmalı. Aksi halde tool zorlanmaz, model serbest
// metinde rakam yazar ve guard cümleyi ortasından keser.
// ---------------------------------------------------------------------------

describe("detectToolHints — İngilizce", () => {
  it("fiyat sorusunu yakalar", () => {
    for (const q of [
      "How much is this room?",
      "What is the price per night?",
      "What are your rates?",
      "Is it expensive?",
      "nightly cost please",
    ]) {
      expect(detectToolHints(q).needsPriceTool, q).toBe(true);
    }
  });

  it("fact sorusunu yakalar", () => {
    for (const q of [
      "What is your cancellation policy?",
      "Do you allow pets?",
      "Is there parking?",
      "Do you have wifi?",
      "What amenities are included?",
      "Is breakfast included?",
    ]) {
      expect(detectToolHints(q).needsFactTool, q).toBe(true);
    }
  });

  it("room + politika kalıbını yakalar", () => {
    expect(detectToolHints("what is the room capacity?").needsFactTool).toBe(true);
    expect(detectToolHints("room cancellation terms").needsFactTool).toBe(true);
  });

  it("alakasız İngilizce soruda tool zorlamaz", () => {
    const hints = detectToolHints("Is the sea warm in August?");
    expect(hints.needsPriceTool).toBe(false);
    expect(hints.needsFactTool).toBe(false);
  });

  it("Türkçe davranışı korunur", () => {
    expect(detectToolHints("gecelik fiyat ne kadar?").needsPriceTool).toBe(true);
    expect(detectToolHints("iptal politikanız nedir?").needsFactTool).toBe(true);
    expect(detectToolHints("deniz sıcak mı?").needsPriceTool).toBe(false);
  });
});

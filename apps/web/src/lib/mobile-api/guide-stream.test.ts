import { describe, expect, it } from "vitest";
import { GuideStreamMapper, toMobileGuideStream } from "./guide-stream";

async function run(lines: string[], split = 7): Promise<unknown[]> {
  const text = lines.map((l) => `${l}\n\n`).join("");
  const bytes = new TextEncoder().encode(text);
  // Ağdaki gibi rastgele parçalara bölünmüş akış: satırlar ortadan kesilebilir.
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += split) controller.enqueue(bytes.slice(i, i + split));
      controller.close();
    },
  });
  const out = await new Response(toMobileGuideStream(source)).text();
  return out.split("\n\n").filter(Boolean).map((l) => JSON.parse(l.replace(/^data: /, "")));
}

describe("iOS rehber akışı", () => {
  it("kart, metin ve bitişi sırayla çevirir; parçalı satırları birleştirir", async () => {
    const events = await run([
      'data: {"type":"start"}',
      'data: {"type":"tool-input-available","toolCallId":"a","toolName":"citeFact","input":{"factId":"spec.check_in"}}',
      'data: {"type":"tool-output-available","toolCallId":"a","output":{"ok":true,"card":{"kind":"verified","label":"Doğrulanmış bilgi","text":"Check-in saati: 14:00"}}}',
      'data: {"type":"text-delta","id":"t","delta":"Check-in 14:00."}',
      'data: {"type":"finish"}',
      "data: [DONE]",
    ]);
    expect(events).toEqual([
      { type: "fact", card: { kind: "verified", label: "Doğrulanmış bilgi", text: "Check-in saati: 14:00" } },
      { type: "text", delta: "Check-in 14:00." },
      { type: "done" },
    ]);
  });

  it("reddedilen kartı (ok:false) misafire göstermez", () => {
    const mapper = new GuideStreamMapper();
    mapper.map({ type: "tool-input-available", toolCallId: "a", toolName: "citeFact", input: {} });
    expect(mapper.map({ type: "tool-output-available", toolCallId: "a", output: { ok: false, error: "x" } })).toEqual([]);
  });

  it("tur yönlendirmesi, öneri çipleri, fiyat ve talep önerisi", () => {
    const mapper = new GuideStreamMapper();
    expect(mapper.map({ type: "tool-input-available", toolCallId: "n", toolName: "navigateTo", input: { stepId: "s2" } })).toEqual([{ type: "navigate", stepId: "s2" }]);
    expect(mapper.map({ type: "tool-input-available", toolCallId: "c", toolName: "suggestNext", input: { chips: ["Havuz?", 3] } })).toEqual([{ type: "chips", chips: ["Havuz?"] }]);
    mapper.map({ type: "tool-input-available", toolCallId: "p", toolName: "getRoomPrice", input: {} });
    const cards = [{ roomName: "Oda", roomSlug: "oda", lines: [], priceOnRequest: false }];
    expect(mapper.map({ type: "tool-output-available", toolCallId: "p", output: { ok: true, cards } })).toEqual([{ type: "price", cards }]);
    mapper.map({ type: "tool-input-available", toolCallId: "i", toolName: "openInquiry", input: {} });
    expect(mapper.map({ type: "tool-output-available", toolCallId: "i", output: { ok: true } })).toEqual([{ type: "inquiry" }]);
  });

  it("akış bitişsiz koparsa hata olayıyla kapanır", async () => {
    const events = await run(['data: {"type":"text-delta","id":"t","delta":"Mer"}']);
    expect(events.at(-1)).toMatchObject({ type: "error" });
  });
});

import { describe, expect, it } from "vitest";
import type { TextStreamPart, ToolSet } from "ai";
import { cardAnswerSentence, cardPointerReplacement, createCardPointerTransform, serverTurnText } from "@/lib/ai/response-guard";

type Chunk = TextStreamPart<ToolSet>;

const amenities = {
  title: undefined,
  text: "Otel olanakları: Açık Havuz, Asansör, Çocuk Havuzu, Kapalı Termal Havuz, Kese, Hamam, Sauna, Otopark.",
};

async function run(question: string | undefined, chunks: Chunk[], language = "tr"): Promise<string> {
  const ts = createCardPointerTransform(question, language)();
  const writer = ts.writable.getWriter();
  const out: Chunk[] = [];
  const reading = (async () => {
    const reader = ts.readable.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      out.push(value);
    }
  })();
  for (const c of chunks) await writer.write(c);
  await writer.close();
  await reading;
  return out.filter((c): c is Extract<Chunk, { type: "text-delta" }> => c.type === "text-delta").map((c) => c.text).join("");
}

const citeResult = (text: string) =>
  ({ type: "tool-result", toolCallId: "t1", toolName: "citeFact", input: {}, output: { ok: true, card: { kind: "verified", label: "", text } } }) as unknown as Chunk;
const textBlock = (...parts: string[]): Chunk[] => [
  { type: "text-start", id: "b1" } as Chunk,
  ...parts.map((text) => ({ type: "text-delta", id: "b1", text }) as Chunk),
  { type: "text-end", id: "b1" } as Chunk,
];

describe("kartın soruya uygun cümlesi", () => {
  it("liste kartında yalnız soruyla eşleşen öğeler kalır", () => {
    expect(cardAnswerSentence(amenities, "Termal havuzlarınızı anlatır mısınız?")).toBe(
      "Otel olanakları: Açık Havuz, Çocuk Havuzu, Kapalı Termal Havuz.",
    );
  });

  it("eşleşme yoksa listenin başı gösterilir", () => {
    expect(cardAnswerSentence(amenities, "Neler sunuyorsunuz?")).toBe(
      "Otel olanakları: Açık Havuz, Asansör, Çocuk Havuzu, Kapalı Termal Havuz, Kese, Hamam, Sauna, Otopark…",
    );
  });

  it("çok cümleli kartta soruya uyan cümle seçilir, alakasız cümle atlanır", () => {
    const card = { text: "Havuz 09:00'da açılır. Akşam yemeği 19:00-21:00 arasındadır. Otopark ücretsizdir." };
    expect(cardAnswerSentence(card, "Akşam yemeği kaçta?")).toBe("Akşam yemeği 19:00-21:00 arasındadır.");
  });

  it("nadir kelime ağır basar: derece sorusunda derece cümlesi", () => {
    const card = {
      text: "Tüm havuzlarımızda termal su bulunur.\nBay/bayan ayrı kapalı termal havuzlar,\nAçık termal bölümde kaydıraklı havuz vardır. Havuzlarımız 35-38 derece sıcaklık arasındadır.",
    };
    expect(cardAnswerSentence(card, "Termal havuz kaç derece?")).toBe("Havuzlarımız 35-38 derece sıcaklık arasındadır.");
  });

  it("aynı konudaki cümleler (kahvaltı + akşam yemeği) birlikte söylenir", () => {
    const card = { text: "Yeme İçme: Sabah kahvaltısı açık büfedir. Akşam yemeği 19:00-21:00 arasındadır." };
    expect(cardAnswerSentence(card, "Yemekler dahil mi?")).toBe(
      "Yeme İçme: Sabah kahvaltısı açık büfedir. Akşam yemeği 19:00-21:00 arasındadır.",
    );
  });

  it("eş anlamlı ve aynı konudaki satırlar birlikte: havalimanı ↔ havaalanı", () => {
    const card = { text: "Otel Konum: Şehir Merkezi'ne 14 km\nZafer Havaalanına 37 km\nEsenboğa Havalimanı 257 km\nFrig Vadisi 46 km" };
    expect(cardAnswerSentence(card, "Havalimanına uzaklığınız ne kadar?")).toBe("Zafer Havaalanına 37 km. Esenboğa Havalimanı 257 km.");
  });
});

describe("boş 'aşağıda bulabilirsiniz' cevabı", () => {
  it("kartın cümlesiyle değişir", () => {
    expect(
      cardPointerReplacement("Termal havuzlarımız hakkında detaylı bilgiyi aşağıda bulabilirsiniz.", [amenities], "Termal havuzlarınızı anlatır mısınız?", "tr"),
    ).toBe("Otel olanakları: Açık Havuz, Çocuk Havuzu, Kapalı Termal Havuz. Ayrıntılar kartta.");
  });

  it("karta işaret etmeyen cevap olduğu gibi kalır", () => {
    expect(cardPointerReplacement("Kapalı termal havuzumuz yıl boyu açıktır.", [amenities], "Termal havuz?", "tr")).toBeNull();
  });

  it("İngilizcede Türkçe kart cümlesi yerine sabit İngilizce metin", () => {
    expect(cardPointerReplacement("You can find the details below.", [amenities], "Pools?", "en")).toBe("I've shared the details on the card for you.");
  });

  it("akışta: kart geldikten sonraki boş cümle değişir", async () => {
    const text = await run("Termal havuzlarınızı anlatır mısınız?", [
      citeResult(amenities.text),
      ...textBlock("Termal havuzlarımız hakkında ", "detaylı bilgiyi aşağıda bulabilirsiniz."),
    ]);
    expect(text).toBe("Otel olanakları: Açık Havuz, Çocuk Havuzu, Kapalı Termal Havuz. Ayrıntılar kartta.");
  });

  it("akışta: kart yoksa metin değişmeden akar", async () => {
    const text = await run("Merhaba", textBlock("Merhaba, ", "aşağıda turu başlatabilirsiniz."));
    expect(text).toBe("Merhaba, aşağıda turu başlatabilirsiniz.");
  });
});

describe("olanak cevabı", () => {
  it("sunucu 'Evet, tesiste X bulunuyor' der", () => {
    const runs = [{ toolName: "citeFact" as const, output: { ok: true, card: amenities } }];
    expect(serverTurnText({ runs, amenities: ["Kese"] }, "tr")).toBe("Evet, tesiste “Kese” bulunuyor.");
    expect(serverTurnText({ runs, amenities: ["Açık Havuz", "Termal Havuz"] }, "tr")).toBe(
      "Evet, tesiste şunlar bulunuyor: “Açık Havuz”, “Termal Havuz”.",
    );
    expect(serverTurnText({ runs, amenities: ["Otopark"], amenityPriceAsked: true }, "tr")).toBe(
      "Evet, tesiste “Otopark” bulunuyor. Ücretli olup olmadığına dair bilgim yok; isterseniz otele sorabilirim.",
    );
    expect(serverTurnText({ runs, amenities: ["Fitness Center"] }, "en")).toBe("Yes, the property has “Fitness Center”.");
  });
});

describe("sunucunun bilgi kartı cevabı", () => {
  const run = (text: string) => [{ toolName: "citeFact" as const, output: { ok: true, card: { kind: "verified", label: "", text } } }];

  it("'kartta paylaştım' yerine kartın soruya uyan cümlesi", () => {
    expect(serverTurnText({ runs: run("Check-in saati: 14:00"), question: "Giriş saati kaçta?" }, "tr")).toBe(
      "Check-in saati: 14:00. Ayrıntılar kartta.",
    );
    expect(serverTurnText({ runs: run(amenities.text), question: "Termal havuzlarınızı anlatır mısınız?" }, "tr")).toBe(
      "Otel olanakları: Açık Havuz, Çocuk Havuzu, Kapalı Termal Havuz. Ayrıntılar kartta.",
    );
  });

  it("İngilizcede Türkçe kart cümlesi söylenmez", () => {
    expect(serverTurnText({ runs: run("Check-in saati: 14:00"), question: "What time is check-in?" }, "en")).toBe(
      "I've shared the details on the card for you.",
    );
  });

  it("'bilgileri paylaştım' da boş cevap sayılır", () => {
    expect(cardPointerReplacement("Termal olanaklarımızla ilgili bilgileri sizin için paylaştım.", [amenities], "Termal havuzlarınızı anlatır mısınız?", "tr")).toBe(
      "Otel olanakları: Açık Havuz, Çocuk Havuzu, Kapalı Termal Havuz. Ayrıntılar kartta.",
    );
  });
});

describe("oda listesi metni", () => {
  const rooms = ["Aile Odası: 39 m², 2 yetişkin + 3 çocuk, Yarım pansiyon.", "Köşe Suit: 40 m², 2 yetişkin + 2 çocuk."];
  it("Türkçe: madde madde", () => {
    expect(serverTurnText({ runs: [], reply: "rooms", rooms }, "tr")).toBe(
      "Otelimizde 2 oda tipi var:\n• Aile Odası: 39 m², 2 yetişkin + 3 çocuk, Yarım pansiyon\n• Köşe Suit: 40 m², 2 yetişkin + 2 çocuk\nFiyat ya da ayrıntı için oda adını yazmanız yeterli.",
    );
  });
  it("İngilizce: yalnız oda adları", () => {
    expect(serverTurnText({ runs: [], reply: "rooms", rooms }, "en")).toBe(
      "We have 2 room types: Aile Odası, Köşe Suit. Ask me about any of them for size, capacity or prices.",
    );
  });
});

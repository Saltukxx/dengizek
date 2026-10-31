import { describe, expect, it } from "vitest";
import {
  classifyQuestionTopic,
  factIdsFromTools,
  outcomeFromTools,
  questionLogPayload,
  summarizeQuestions,
} from "@/lib/ai/question-log";

describe("soru konusu", () => {
  it.each([
    ["Giriş saati kaçta?", "giris-cikis"],
    ["What time is check-out?", "giris-cikis"],
    ["Odada köpeğimle kalabilir miyim?", "evcil-hayvan"],
    ["2 gece için fiyat nedir?", "fiyat"],
    ["15 Temmuz'da boş oda var mı?", "musaitlik-rezervasyon"],
    ["Havalimanına uzaklığınız ne kadar?", "konum-ulasim"],
    ["Yemekler dahil mi, konseptiniz nedir?", "yeme-icme"],
    ["Termal havuz kaç derece?", "havuz-spa"],
    ["Standart oda kaç kişilik?", "oda"],
    ["Otopark var mı?", "olanak"],
    ["Telefon numaranız nedir?", "iletisim"],
    ["Tarihçeniz nedir?", "diger"],
  ])("%s → %s", (q, topic) => {
    expect(classifyQuestionTopic(q)).toBe(topic);
  });
});

describe("soru kaydı", () => {
  it("iletişim bilgisi maskelenir, selamlaşma kaydedilmez", () => {
    const payload = questionLogPayload({
      question: "Beni 0532 123 45 67'den arar mısınız?",
      answer: "Talep formunu açabilirim.",
      outcome: "yonlendirme",
      source: "sunucu",
    });
    expect(payload?.question).not.toContain("0532 123 45 67");
    expect(payload?.key).toBeTruthy();
    expect(questionLogPayload({ question: "Merhaba", answer: "Merhaba!", outcome: "model", source: "model" })).toBeNull();
  });

  it("sonuç araçlardan çıkarılır", () => {
    const fact = (ok: boolean) => ({ toolName: "citeFact", input: { factId: "spec.check_in" }, output: { ok } });
    expect(outcomeFromTools([fact(true)])).toBe("cevaplandi");
    expect(outcomeFromTools([fact(false)])).toBe("bilgi-yok");
    expect(outcomeFromTools([], { unknownReply: true })).toBe("bilgi-yok");
    expect(outcomeFromTools([{ toolName: "navigateTo", output: {} }])).toBe("yonlendirme");
    expect(outcomeFromTools([], { redirectReply: true })).toBe("yonlendirme");
    expect(outcomeFromTools([])).toBe("model");
    expect(factIdsFromTools([fact(true), fact(false)])).toEqual(["spec.check_in"]);
  });
});

describe("soru özeti", () => {
  const at = (d: string) => new Date(`2026-10-${d}T10:00:00Z`);
  const ev = (hotelSlug: string, question: string, outcome: string, d = "20") => ({
    hotelSlug,
    createdAt: at(d),
    payload: questionLogPayload({ question, answer: "x", outcome: outcome as never, source: "sunucu", language: "tr" }) as Record<string, unknown> | null,
  });

  it("en çok sorulanlar, oteller, konular, cevaplanma oranı", () => {
    const s = summarizeQuestions([
      ev("a", "Giriş saati kaçta?", "cevaplandi"),
      ev("b", "giriş saati kaçta", "bilgi-yok", "21"),
      ev("a", "Giriş saati kaçta?", "cevaplandi"),
      ev("a", "Kese var mı?", "model"),
      ev("b", "Havalimanına uzaklığınız ne kadar?", "cevaplandi"),
      { hotelSlug: "a", createdAt: at("22"), payload: null },
    ]);
    expect(s.total).toBe(5);
    expect(s.answerRate).toBe(0.6);
    expect(s.topQuestions[0]).toMatchObject({ count: 3, hotels: 2, unanswered: 1, topic: "giris-cikis" });
    expect(s.byHotel).toEqual([
      { hotelSlug: "a", count: 3, unanswered: 1 },
      { hotelSlug: "b", count: 2, unanswered: 1 },
    ]);
    expect(s.byTopic[0]).toMatchObject({ topic: "giris-cikis", count: 3, unanswered: 1 });
    expect(s.topUnanswered.map((g) => g.question)).toContain("Kese var mı?");
    expect(s.byLanguage).toEqual([{ language: "tr", count: 5 }]);
  });
});

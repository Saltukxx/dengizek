import { describe, expect, it } from "vitest";
import { answerFactText, answerFor, groupUnanswered, isQuestionLike, unansweredPayload, withAnswerStatus } from "@/lib/ai/unanswered";

describe("cevapsız soru kaydı", () => {
  it.each(["Golf sahası var mı?", "termal havuz kaç derece", "Is there a shuttle", "Kahvaltı ne zaman"])("%s → soru", (m) => {
    expect(isQuestionLike(m)).toBe(true);
  });
  it.each(["Merhaba", "Teşekkürler", "tamam", "harika olmuş"])("%s → soru değil", (m) => {
    expect(isQuestionLike(m)).toBe(false);
  });

  it("iletişim bilgisi maskelenir, uzunluk sınırlanır", () => {
    const payload = unansweredPayload(`Beni 0532 123 45 67 numaradan arar mısınız? ${"x".repeat(300)}`, "bilgi-yok")!;
    expect(payload.question).not.toContain("0532 123 45 67");
    expect(payload.question.length).toBeLessThanOrEqual(200);
  });

  it("aynı soru gruplanır, 'bilgi yok' öncelikli, en çok sorulan önce", () => {
    const at = (d: string) => new Date(`2026-10-${d}T10:00:00Z`);
    const groups = groupUnanswered([
      { payload: { question: "Golf sahası var mı?", reason: "kartsiz" }, createdAt: at("20") },
      { payload: { question: "golf sahasi var mi", reason: "bilgi-yok" }, createdAt: at("22") },
      { payload: { question: "Havuz kaç derece?", reason: "kartsiz" }, createdAt: at("21") },
      { payload: { question: "Golf sahası var mı?", reason: "kartsiz" }, createdAt: at("23") },
      { payload: null, createdAt: at("23") },
    ]);
    expect(groups).toEqual([
      { question: "Golf sahası var mı?", count: 3, reason: "bilgi-yok", lastAskedAt: "2026-10-23T10:00:00.000Z" },
      { question: "Havuz kaç derece?", count: 1, reason: "kartsiz", lastAskedAt: "2026-10-21T10:00:00.000Z" },
    ]);
  });
});

describe("otelcinin cevabı", () => {
  it("ifade metni: soru + cevap; aynı soru (yazım farkıyla) bulunur", () => {
    const fact = answerFactText("Kese var mı", "Evet, hamamda ücretli kese hizmeti var.");
    expect(fact).toBe("Kese var mı? — Evet, hamamda ücretli kese hizmeti var.");
    expect(answerFor("kese var mi?", ["Deniz manzarası eşsizdir.", fact])).toBe("Evet, hamamda ücretli kese hizmeti var.");
    expect(answerFor("Sauna var mı?", [fact])).toBeNull();
  });

  it("durum: yayındaki cevap öncelikli, cevaplananlar sona", () => {
    const at = "2026-10-30T10:00:00.000Z";
    const groups = [
      { question: "Kese var mı?", count: 5, reason: "bilgi-yok" as const, lastAskedAt: at },
      { question: "Transfer var mı?", count: 3, reason: "bilgi-yok" as const, lastAskedAt: at },
      { question: "Bebek yatağı var mı?", count: 1, reason: "kartsiz" as const, lastAskedAt: at },
    ];
    const draft = [answerFactText("Kese var mı?", "Evet."), answerFactText("Bebek yatağı var mı?", "Talep üzerine.")];
    const published = [answerFactText("Kese var mı?", "Evet.")];
    const out = withAnswerStatus(groups, draft, published);
    expect(out.map((g) => [g.question, g.answer?.status ?? null])).toEqual([
      ["Transfer var mı?", null],
      ["Kese var mı?", "yayinda"],
      ["Bebek yatağı var mı?", "taslak"],
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { groupUnanswered, isQuestionLike, unansweredPayload } from "@/lib/ai/unanswered";

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

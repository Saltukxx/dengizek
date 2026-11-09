import { describe, expect, it } from "vitest";
import { feedbackPayload, summarizeFeedback } from "@/lib/ai/feedback";

describe("misafir değerlendirmesi", () => {
  it("kayıt: iletişim bilgisi maskelenir, konu ve anahtar eklenir", () => {
    const p = feedbackPayload({ rating: "down", messageId: "m1", question: "Beni 0532 123 45 67'den arar mısınız?", answer: "x".repeat(500), tourId: "t" });
    expect(p.question).not.toContain("0532 123 45 67");
    expect(p.answer.length).toBe(300);
    expect(p.topic).toBe("iletisim");
  });

  it("özet: aynı cevaba son oy sayılır; en çok 👎 alan sorular", () => {
    const at = (m: number) => new Date(Date.UTC(2026, 9, 30, 10, m));
    const ev = (messageId: string, rating: string, question: string, m: number) => ({
      createdAt: at(m),
      payload: feedbackPayload({ rating: rating as "up" | "down", messageId, question, answer: `cevap ${messageId}`, tourId: "t" }) as unknown as Record<string, unknown>,
    });
    const s = summarizeFeedback([
      ev("m1", "down", "Kese var mı?", 1),
      ev("m1", "up", "Kese var mı?", 2), // fikir değişti
      ev("m2", "down", "Transfer var mı?", 3),
      ev("m3", "down", "transfer var mi", 4),
      ev("m4", "up", "Giriş saati kaçta?", 5),
      { createdAt: at(6), payload: { rating: "meh" } },
    ]);
    expect([s.up, s.down, s.positiveRate]).toEqual([2, 2, 0.5]);
    expect(s.topDown).toEqual([{ question: "transfer var mi", answer: "cevap m3", count: 2, lastAt: at(4).toISOString() }]);
    expect(s.byTopic.find((t) => t.topic === "giris-cikis")).toMatchObject({ up: 1, down: 0 });
  });
});

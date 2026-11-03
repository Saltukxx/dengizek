import { describe, expect, it } from "vitest";
import { buildCandidates, promoteCandidates, type EvalCandidate } from "@/lib/ai/eval-candidates";

const at = (d: number) => new Date(Date.UTC(2026, 9, d, 10));
const ev = (eventType: string, hotelSlug: string | null, payload: Record<string, unknown>, d = 20) => ({ eventType, hotelSlug, payload, createdAt: at(d) });

describe("eval adayları", () => {
  it("👎 ve cevapsız sorular otel bazında gruplanır; 👎 alanlar önce", () => {
    const c = buildCandidates(
      [
        ev("ai_unanswered", "a", { question: "Transfer var mı?" }),
        ev("ai_unanswered", "a", { question: "transfer var mi" }, 21),
        ev("ai_unanswered", "a", { question: "Transfer var mı?" }, 22),
        ev("ai_feedback", "a", { rating: "down", question: "Kese var mı?", answer: "Bilgim yok." }),
        ev("ai_feedback", "a", { rating: "up", question: "Giriş saati?" }),
        ev("ai_unanswered", "b", { question: "Transfer var mı?" }),
        ev("ai_unanswered", null, { question: "Otelsiz soru?" }),
      ],
      [{ hotel: "b", question: "transfer var mı" }],
    );
    expect(c.map((x) => [x.hotel, x.question, x.count, x.sources.down])).toEqual([
      ["a", "Kese var mı?", 1, 1],
      ["a", "Transfer var mı?", 3, 0],
    ]);
    expect(c[0]).toMatchObject({ id: "a:kese-var-mi", topic: "havuz-spa", lastAnswer: "Bilgim yok.", approve: false });
  });

  it("onaylılar eklenir; iletişim bilgisi ve tekrar reddedilir", () => {
    const base: Omit<EvalCandidate, "id" | "question" | "approve"> = {
      hotel: "a", topic: "diger", count: 1, sources: { down: 1, unanswered: 0 }, lastAt: at(20).toISOString(), expect: {},
    };
    const r = promoteCandidates(
      [
        { ...base, id: "a:kese", question: "Kese var mı?", approve: true, expect: { contains: ["kese"] } },
        { ...base, id: "a:x", question: "Onaysız", approve: false },
        { ...base, id: "a:tel", question: "0532 123 45 67 arar mısınız?", approve: true },
        { ...base, id: "a:eski", question: "Giriş saati kaçta?", approve: true },
      ],
      [{ id: "a:eski", hotel: "a", question: "giriş saati kaçta", topic: "giris-cikis", expect: {}, addedAt: "2026-10-01" }],
      "2026-10-31",
    );
    expect(r.added).toEqual(["a:kese"]);
    expect(r.fixtures.at(-1)).toEqual({ id: "a:kese", hotel: "a", question: "Kese var mı?", topic: "diger", expect: { contains: ["kese"] }, addedAt: "2026-10-31" });
    expect(r.rejected.map((x) => x.id)).toEqual(["a:tel", "a:eski"]);
  });
});

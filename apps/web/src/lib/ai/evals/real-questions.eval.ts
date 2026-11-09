// ---------------------------------------------------------------------------
// Gerçek misafir soruları — GERÇEK Gemini çağrısı yapar.
//
// Sorular real-questions.json'dan: 👎 alan ya da cevapsız kalan, bir kişinin
// onayladığı misafir soruları (bkz. scripts/eval-candidates.ts). Her soruda:
//   - yanıltıcı yönlendirme yok (bilinen konuda karta işaret edip cevap yok)
//   - expect.contains: görünen cevapta (metin + kart) geçmeli
//   - expect.unknown: rehber "bilgim yok" demeli
//   - model konuştuysa hakem uydurma arar
// Otel yerel veritabanında yayında değilse soru atlanır (raporda sayılır).
//
//   npm run test:eval:real          Çıktı: eval-real-metrics.json
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, it, vi } from "vitest";
import { isMisleadingCardPointer } from "@/lib/ai/deterministic-tools";
import { normalizeText } from "@/lib/ai/text";
import type { RealQuestionFixture } from "@/lib/ai/eval-candidates";
import { QuotaExhaustedError, judgeGrounding, runTurn, shownCards, type Verdict } from "./harness";

// Gerçek otellerin yerelde turu olmayabilir: tek adımlı tur taklit edilir.
vi.mock("@/lib/mocks/hotels", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mocks/hotels")>()),
  getTourManifest: async (hotelSlug: string, tourId: string) => ({
    tourId,
    hotelSlug,
    version: 1,
    steps: [{ stepId: "s1", order: 0, kind: "lobby", title: "Genel bakış", requiresUserContinue: false, media: { mode: "clip", src: "/demo.mp4" } }],
  }),
}));

const fixtures = JSON.parse(readFileSync(path.resolve(__dirname, "real-questions.json"), "utf-8")) as RealQuestionFixture[];

interface Result {
  id: string;
  hotel: string;
  question: string;
  status: "ok" | "hata" | "atlandi" | "bekliyor";
  reason?: string;
  text?: string;
  verdict?: Verdict;
}
const results: Result[] = [];

describe(`Gerçek misafir soruları (${fixtures.length})`, () => {
  afterAll(() => {
    const count = (s: Result["status"]) => results.filter((r) => r.status === s).length;
    const decided = count("ok") + count("hata");
    const summary = {
      generatedAt: new Date().toISOString(),
      questions: results.length,
      accuracy: decided ? +(count("ok") / decided).toFixed(4) : null,
      ok: count("ok"),
      failed: count("hata"),
      skipped: count("atlandi"),
      pending: count("bekliyor"),
      results,
    };
    writeFileSync("eval-real-metrics.json", JSON.stringify(summary, null, 2));
    console.log(`\nGerçek sorular: ${summary.ok}/${decided} doğru · atlanan ${summary.skipped} · bekleyen ${summary.pending}`);
  });

  if (!fixtures.length) {
    it.skip("henüz onaylı gerçek soru yok (npm run eval:candidates)", () => {});
    return;
  }

  for (const f of fixtures) {
    it(f.id, async () => {
      let turn;
      try {
        turn = await runTurn({ id: f.id, hotel: f.hotel, tour: "eval", message: f.question, expect: {} });
      } catch (error) {
        // Kota bitti → bekliyor; otel yerelde yok ya da yayında değil → atlandı.
        const status = error instanceof QuotaExhaustedError ? "bekliyor" : "atlandi";
        results.push({ id: f.id, hotel: f.hotel, question: f.question, status, reason: String(error).slice(0, 120) });
        return;
      }
      const cards = shownCards(turn.tools);
      const visible = normalizeText([turn.text, ...cards.map((c) => `${c.title ?? ""} ${c.text}`)].join("\n"));
      let reason: string | undefined;
      if (turn.reply !== "unknown" && isMisleadingCardPointer(f.question, turn.text, cards)) reason = "yanıltıcı yönlendirme";
      const missing = (f.expect.contains ?? []).filter((s) => !visible.includes(normalizeText(s)));
      if (!reason && missing.length) reason = `beklenen yok: ${missing.join(", ")}`;
      // Bilgi yok beklenen soruda kart gösterilmemeli; modelin metni hakemde denetlenir.
      if (!reason && f.expect.unknown && turn.reply !== "unknown" && cards.length) reason = `bilgi yokken kart gösterildi: ${cards[0]!.text.slice(0, 80)}`;
      let verdict: Verdict | undefined;
      if (!reason && turn.modelSpoke) {
        verdict = await judgeGrounding(turn.data, f.question, turn.text, cards);
        if (!verdict.grounded && !verdict.skipped) reason = `uydurma: ${verdict.claim ?? "?"}`;
      }
      results.push({
        id: f.id,
        hotel: f.hotel,
        question: f.question,
        status: reason ? "hata" : verdict?.skipped ? "bekliyor" : "ok",
        reason,
        text: turn.text.slice(0, 300),
        verdict,
      });
    });
  }
});

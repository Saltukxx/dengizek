// ---------------------------------------------------------------------------
// Model karşılaştırması (Aşama 4) — GERÇEK Gemini çağrısı yapar.
//
// Yalnız modelin konuştuğu turlar ölçülür (sunucu turları modelden bağımsız):
// tur açılış anlatımı ve kartı olmayan serbest sorular. Her model aynı
// sorularla koşar; yedek model kapalıdır (AI_FALLBACK_MODEL=none).
//
//   EVAL_CHAT_MODELS=gemini-3.1-flash-lite,gemini-3.5-flash npm run test:eval:models
//   EVAL_HOTEL_LIMIT=5 (varsayılan)
//
// Karar kuralı (plan): ilk model taban; aday, doğrulukta ≥ 3 puan artış ve
// p50 gecikme ≤ 3 sn ise önerilir. Not: hakem 3.5 Flash — aynı model aday
// olduğunda kendi cevabını denetler (yanlılık olası).
// Çıktı: eval-models-metrics.json
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, it, vi } from "vitest";
import { textContainsPriceLikeContent } from "@/lib/ai/response-guard";
import { containsContactInfo } from "@/lib/contact-guard";
import { QuotaExhaustedError, judgeGrounding, runTurn, shownCards, type TurnResult } from "./harness";
import type { Fixture } from "./fixtures";

vi.mock("@/lib/mocks/hotels", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mocks/hotels")>()),
  getTourManifest: async (hotelSlug: string, tourId: string) => ({
    tourId,
    hotelSlug,
    version: 1,
    steps: [{ stepId: "s1", order: 0, kind: "lobby", title: "Genel bakış", requiresUserContinue: false, media: { mode: "clip", src: "/demo.mp4" } }],
  }),
}));

const MODELS = (process.env.EVAL_CHAT_MODELS ?? "gemini-3.1-flash-lite,gemini-3.5-flash").split(",").map((m) => m.trim()).filter(Boolean);
const HOTELS_FILE =
  process.env.EVAL_HOTELS_FILE ?? path.resolve(__dirname, "../../../../../../data/oteldenrezerve/termal-oteller/oteller.json");
const LIMIT = Number(process.env.EVAL_HOTEL_LIMIT) || 5;
const slugs = (JSON.parse(readFileSync(HOTELS_FILE, "utf-8")) as Array<{ slug: string }>).map((h) => h.slug).slice(0, LIMIT);

const PROMPTS: Array<{ key: string; message?: string; trigger?: Fixture["trigger"] }> = [
  { key: "tur-acilis", trigger: "tourStart" },
  { key: "serbest-termal", message: "Termal havuzlarınızı anlatır mısınız?" },
  { key: "serbest-tanitim", message: "Otelinizi kısaca tanıtır mısınız?" },
  { key: "serbest-cocuk", message: "Çocuklarla gelmek için uygun mu?" },
];

interface Turn {
  model: string;
  id: string;
  status: "ok" | "uydurma" | "sizinti" | "bekliyor" | "sunucu";
  durationMs: number;
  outputTokens: number;
  text: string;
  claim?: string;
}
const turns: Turn[] = [];

const percentile = (values: number[], p: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
};

describe(`Model karşılaştırması (${MODELS.join(" vs ")}, ${slugs.length} otel)`, () => {
  afterAll(() => {
    const byModel = MODELS.map((model) => {
      const mine = turns.filter((t) => t.model === model && t.status !== "sunucu");
      const decided = mine.filter((t) => t.status !== "bekliyor");
      const ok = decided.filter((t) => t.status === "ok").length;
      const durations = mine.filter((t) => t.status !== "bekliyor").map((t) => t.durationMs);
      return {
        model,
        turns: mine.length,
        decided: decided.length,
        accuracy: decided.length ? +(ok / decided.length).toFixed(4) : null,
        ungrounded: decided.filter((t) => t.status === "uydurma").length,
        leaks: decided.filter((t) => t.status === "sizinti").length,
        pending: mine.length - decided.length,
        p50Ms: percentile(durations, 50),
        p95Ms: percentile(durations, 95),
        avgOutputTokens: decided.length ? Math.round(decided.reduce((s, t) => s + t.outputTokens, 0) / decided.length) : null,
        failures: decided.filter((t) => t.status !== "ok").map((t) => ({ id: t.id, status: t.status, claim: t.claim, text: t.text.slice(0, 200) })),
      };
    });
    const [base, ...candidates] = byModel;
    const decisions = candidates.map((c) => {
      const gain = base?.accuracy != null && c.accuracy != null ? +((c.accuracy - base.accuracy) * 100).toFixed(1) : null;
      const fast = c.p50Ms != null && c.p50Ms <= 3000;
      return { model: c.model, accuracyGainPoints: gain, p50Ms: c.p50Ms, recommend: gain != null && gain >= 3 && fast };
    });
    writeFileSync("eval-models-metrics.json", JSON.stringify({ generatedAt: new Date().toISOString(), base: base?.model, byModel, decisions }, null, 2));
    for (const m of byModel) {
      console.log(`${m.model.padEnd(26)} doğruluk ${m.accuracy == null ? "—" : `%${(m.accuracy * 100).toFixed(1)}`} (${m.decided} tur, ${m.pending} bekliyor) · p50 ${m.p50Ms ?? "—"} ms · p95 ${m.p95Ms ?? "—"} ms`);
    }
    for (const d of decisions) console.log(`→ ${d.model}: ${d.recommend ? "ÖNERİLİR" : "önerilmez"} (artış ${d.accuracyGainPoints ?? "—"} puan, p50 ${d.p50Ms ?? "—"} ms)`);
  });

  for (const model of MODELS) {
    for (const slug of slugs) {
      for (const prompt of PROMPTS) {
        const id = `${slug}:${prompt.key}`;
        it(`${model} · ${id}`, async () => {
          const previous = { chat: process.env.AI_CHAT_MODEL, fallback: process.env.AI_FALLBACK_MODEL };
          process.env.AI_CHAT_MODEL = model;
          process.env.AI_FALLBACK_MODEL = "none";
          const started = Date.now();
          let turn: TurnResult;
          try {
            turn = await runTurn({ id, hotel: slug, tour: "eval", message: prompt.message ?? "", trigger: prompt.trigger, expect: {} });
          } catch (error) {
            if (!(error instanceof QuotaExhaustedError)) throw error;
            turns.push({ model, id, status: "bekliyor", durationMs: 0, outputTokens: 0, text: "" });
            return;
          } finally {
            process.env.AI_CHAT_MODEL = previous.chat;
            process.env.AI_FALLBACK_MODEL = previous.fallback;
            if (previous.chat === undefined) delete process.env.AI_CHAT_MODEL;
            if (previous.fallback === undefined) delete process.env.AI_FALLBACK_MODEL;
          }
          // Kota beklemeleri ve embedding hataları hariç: yalnız model çağrısı.
          const durationMs = turn.modelMs ?? Date.now() - started;
          const base = { model, id, durationMs, outputTokens: turn.outputTokens, text: turn.text };
          // Bu soru bu otelde sunucu turuna düştüyse model ölçülmez.
          if (!turn.modelSpoke) return void turns.push({ ...base, status: "sunucu" });
          if (containsContactInfo(turn.text) || textContainsPriceLikeContent(turn.text, { hadPriceTool: turn.tools.some((t) => t.toolName === "getRoomPrice") })) {
            return void turns.push({ ...base, status: "sizinti" });
          }
          const verdict = await judgeGrounding(turn.data, prompt.message ?? "(tur açılışı)", turn.text, shownCards(turn.tools));
          turns.push({ ...base, status: verdict.skipped ? "bekliyor" : verdict.grounded ? "ok" : "uydurma", claim: verdict.claim });
        });
      }
    }
  }
});

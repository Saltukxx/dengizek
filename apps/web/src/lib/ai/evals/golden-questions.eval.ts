// ---------------------------------------------------------------------------
// AI rehber eval — GERÇEK Gemini çağrısı yapar.
//
// Normal `npm test`'e dahil DEĞİLDİR (bkz. vitest.eval.config.mts).
// Çalıştırmak için: `npm run test:eval` — GEMINI_API_KEY ve seed'lenmiş bir
// DATABASE_URL gerekir (bkz. src/lib/db/seed.ts). Soru seti: fixtures.ts.
//
// Her soru canlı rotayla AYNI akıştan geçer: bağlam → sunucu araçları
// (runServerTools) → sabit metin ya da model. Model konuştuğunda ikinci bir
// Gemini çağrısı ("hakem") cevabın otel verisinin dışında iddia içerip
// içermediğini puanlar.
//
// Çıktı: eval-metrics.json (süre, token, hakem sonuçları).
// ---------------------------------------------------------------------------

import { writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chatModelId, getChatModel } from "@/lib/ai/llm";
import { textContainsPriceLikeContent } from "@/lib/ai/response-guard";
import { fixtures } from "./fixtures";
import { judgeGrounding, runTurn, type Verdict } from "./harness";

// ---------------------------------------------------------------------------
// Eval
// ---------------------------------------------------------------------------

interface FixtureMetric {
  id: string;
  hotel: string;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  tools: string[];
  modelSpoke: boolean;
  text: string;
  verdict?: Verdict;
}

const metrics: FixtureMetric[] = [];

describe(`AI rehber eval (${fixtures.length} soru, gerçek model)`, () => {
  beforeAll(() => {
    if (!getChatModel()) throw new Error("GEMINI_API_KEY tanımlı değil — .env.local'a ekleyin.");
  });

  afterAll(() => {
    const spoke = metrics.filter((m) => m.verdict);
    writeFileSync(
      "eval-metrics.json",
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          model: chatModelId(),
          fixtureCount: metrics.length,
          modelTurns: spoke.length,
          ungrounded: spoke.filter((m) => !m.verdict?.grounded).map((m) => ({ id: m.id, claim: m.verdict?.claim, text: m.text })),
          totalTokens: metrics.reduce((s, m) => s + m.inputTokens + m.outputTokens, 0),
          avgDurationMs: metrics.length ? Math.round(metrics.reduce((s, m) => s + m.durationMs, 0) / metrics.length) : 0,
          fixtures: metrics,
        },
        null,
        2,
      ),
    );
  });

  for (const fixture of fixtures) {
    it(fixture.id, async () => {
      const started = Date.now();
      const turn = await runTurn(fixture);
      const metric: FixtureMetric = {
        id: fixture.id,
        hotel: fixture.hotel,
        durationMs: Date.now() - started,
        inputTokens: turn.inputTokens,
        outputTokens: turn.outputTokens,
        tools: turn.tools.map((t) => t.toolName),
        modelSpoke: turn.modelSpoke,
        text: turn.text,
      };
      metrics.push(metric);

      const e = fixture.expect;
      const called = new Set(turn.tools.map((t) => t.toolName));
      const describeTurn = `araçlar: ${[...called].join(", ") || "yok"} | metin: ${turn.text.slice(0, 160)}`;

      for (const name of e.tools ?? []) {
        expect(called.has(name), `beklenen araç çağrılmadı: ${name} (${describeTurn})`).toBe(true);
      }
      for (const name of e.notTools ?? []) {
        expect(called.has(name), `çağrılmaması gereken araç: ${name} (${describeTurn})`).toBe(false);
      }

      const cited = turn.tools.filter((t) => t.toolName === "citeFact").map((t) => String(t.input.factId));
      if (e.factIds) {
        expect(cited.length > 0 && cited.every((id) => e.factIds!.includes(id)), `factId ${cited.join(",") || "yok"} ∉ [${e.factIds.join(", ")}]`).toBe(true);
      }
      if (e.unknownOrFacts) {
        const ok = turn.reply === "unknown" || (cited.length > 0 && cited.every((id) => e.unknownOrFacts!.includes(id)));
        expect(ok, `ne "bilgim yok" ne beklenen kart (${describeTurn})`).toBe(true);
      }
      if (e.reply) expect(turn.reply, describeTurn).toBe(e.reply);

      const price = turn.tools.find((t) => t.toolName === "getRoomPrice")?.input;
      if (e.price) expect(price, describeTurn).toMatchObject(e.price);
      for (const key of e.priceAbsent ?? []) expect(price?.[key], `fiyat sorgusunda ${key} olmamalı`).toBeUndefined();

      if (e.steps) {
        const stepId = turn.tools.find((t) => t.toolName === "navigateTo")?.input.stepId;
        expect(e.steps, describeTurn).toContain(stepId);
      }
      if (e.inquiryBlocked !== undefined) {
        const inquiry = turn.tools.find((t) => t.toolName === "openInquiry");
        if (inquiry) expect((inquiry.output as { blocked?: boolean } | undefined)?.blocked === true).toBe(e.inquiryBlocked);
        else if (e.inquiryBlocked === false) expect.fail(`openInquiry çağrılmadı (${describeTurn})`);
      }

      // Metinde asla fiyat yok — fiyat yalnız kartta.
      expect(textContainsPriceLikeContent(turn.text), `metinde fiyat: ${turn.text}`).toBe(false);

      // Model konuştuysa hakem: otel verisi dışında iddia var mı?
      if (turn.modelSpoke && turn.text.trim()) {
        metric.verdict = await judgeGrounding(turn.data, fixture.message || `(tur tetikleyicisi: ${fixture.trigger})`, turn.text);
        expect(metric.verdict.grounded, `uydurma: ${metric.verdict.claim} | metin: ${turn.text}`).toBe(true);
      }
    });
  }
});

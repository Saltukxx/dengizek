// ---------------------------------------------------------------------------
// AI yanıt-kalitesi eval config — gerçek model çağrıları yapar (Gemini API), bu yüzden
// normal `pnpm test`/`vitest.config.mts` include deseninin (*.test.ts) DIŞINDA
// tutulur; bilinçli olarak vitest.config.mts'i merge ETMEZ (Vite'ın
// mergeConfig'i array'leri birleştirir, `include` kesin bir liste olarak
// kalmalı) — bunun yerine gerekli parçaları burada ayrıca tanımlar.
// Yalnızca `pnpm test:eval` ile veya CI'da ayrı bir schedule/manual workflow
// ile çalıştırılır. GEMINI_API_KEY ve (seed'lenmiş bir DB için) DATABASE_URL
// gerektirir.
// ---------------------------------------------------------------------------

import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    include: ["src/lib/ai/evals/**/*.eval.ts"],
    testTimeout: 60_000,
    // Eval'lar gerçek API'ye seri seri gitsin — paralel çoklu istekte
    // rate-limit'e takılma riski azalır, sonuçlar da okunması kolay sırada gelir.
    fileParallelism: false,
    // describe.concurrent kullanan eval'larda (imported-hotels) aynı anda en
    // fazla 2 soru: ücretsiz katmanın dakika başı sınırına takılmasın.
    maxConcurrency: 2,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

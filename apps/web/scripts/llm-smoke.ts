// ---------------------------------------------------------------------------
// Gemini duman testi — API anahtarının çalıştığını, embedding boyutunun
// şemayla uyuştuğunu ve sohbet modelinin araç çağırabildiğini doğrular.
// Kullanım:
//   npx dotenv -e .env.local -- npx tsx scripts/llm-smoke.ts
// ---------------------------------------------------------------------------

import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { cosineSimilarity, embedText } from "../src/lib/ai/embeddings";
import { CHAT_PROVIDER_OPTIONS, chatModelId, EMBEDDING_DIMENSIONS, getChatModel } from "../src/lib/ai/llm";

async function main() {
  const model = getChatModel();
  if (!model) throw new Error("GEMINI_API_KEY tanımlı değil.");

  // 1) Embedding: boyut + anlamsal benzerlik makul mü?
  let t = Date.now();
  const [a, b, c] = await Promise.all([
    embedText("Bu odayı rezerve etmek istiyorum."),
    embedText("Oda ayırtmak istiyorum, nasıl yapabilirim?"),
    embedText("Havuz saat kaçta kapanıyor?"),
  ]);
  if (!a || !b || !c) throw new Error("embedding üretilemedi");
  console.log(`embedding: ${a.length} boyut (beklenen ${EMBEDDING_DIMENSIONS}), ${Date.now() - t} ms`);
  console.log(`  benzer cümleler: ${cosineSimilarity(a, b).toFixed(3)}  alakasız: ${cosineSimilarity(a, c).toFixed(3)}`);

  // 2) Serbest Türkçe yanıt
  t = Date.now();
  const hello = await generateText({
    model,
    system: "Sen bir otelin sanal tur rehberisin. Kısa ve Türkçe yanıt ver.",
    prompt: "Merhaba, otelinizde spa var mı?",
    maxRetries: 0,
    providerOptions: CHAT_PROVIDER_OPTIONS,
  });
  console.log(`\nsohbet (${chatModelId()}), ${Date.now() - t} ms, ${hello.usage.outputTokens} token:`);
  console.log(`  ${hello.text.trim().replace(/\n/g, " ")}`);

  // 3) Araç çağırma: fiyat sorusunda getRoomPrice çağrılmalı
  t = Date.now();
  let called: unknown = null;
  const priced = await generateText({
    model,
    system:
      "Sen bir otel rehberisin. Fiyatı ASLA kendin yazma; fiyat sorulursa getRoomPrice aracını çağır.",
    prompt: "Deniz manzaralı odanın 12-15 Temmuz arası fiyatı ne kadar?",
    tools: {
      getRoomPrice: tool({
        description: "Oda fiyatını tarih aralığı için döndürür.",
        inputSchema: z.object({
          roomSlug: z.string(),
          checkIn: z.string(),
          checkOut: z.string(),
        }),
        execute: async (input) => {
          called = input;
          return { totalTRY: 18400 };
        },
      }),
    },
    toolChoice: "required",
    stopWhen: stepCountIs(2),
    maxRetries: 0,
    providerOptions: CHAT_PROVIDER_OPTIONS,
  });
  console.log(`\naraç çağırma, ${Date.now() - t} ms:`);
  console.log(`  getRoomPrice çağrıldı mı: ${called ? "EVET " + JSON.stringify(called) : "HAYIR"}`);
  console.log(`  yanıt: ${priced.text.trim().replace(/\n/g, " ") || "(boş)"}`);
}

main().catch((err) => {
  console.error("HATA:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

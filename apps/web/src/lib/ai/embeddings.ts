// ---------------------------------------------------------------------------
// Embedding yardımcıları — fact retrieval (context-router) ve rezervasyon
// niyeti tespiti (completion-engine) tarafından paylaşılır. Model: Gemini
// embedding (bkz. llm.ts).
// ---------------------------------------------------------------------------

import { embed, cosineSimilarity } from "ai";
import { EMBEDDING_DIMENSIONS, EMBEDDING_PROVIDER_OPTIONS, getEmbeddingModel } from "@/lib/ai/llm";

/**
 * Metni embed eder. GEMINI_API_KEY yoksa, API hata verirse veya
 * vektör boyutu şemayla uyuşmazsa null döner — çağıran taraf her zaman
 * lexical/deterministik bir fallback'e düşebilmeli (RAG hatası sohbeti asla
 * kırmamalı).
 */
export async function embedText(text: string): Promise<number[] | null> {
  if (!text.trim()) return null;
  const model = getEmbeddingModel();
  if (!model) return null;
  try {
    const { embedding } = await embed({
      model,
      value: text,
      maxRetries: 1,
      providerOptions: EMBEDDING_PROVIDER_OPTIONS,
    });
    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      // Yanlış model seçilmiş: DB'ye yazılamaz, sorguda pgvector hata verir.
      console.warn(
        `[embeddings] beklenen boyut ${EMBEDDING_DIMENSIONS}, gelen ${embedding.length} — AI_EMBEDDING_MODEL'i kontrol edin`,
      );
      return null;
    }
    return embedding;
  } catch (err) {
    console.warn("[embeddings] embedText başarısız:", err);
    return null;
  }
}

export { cosineSimilarity };

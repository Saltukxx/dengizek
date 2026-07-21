// ---------------------------------------------------------------------------
// Embedding yardımcıları — fact retrieval (context-router) ve rezervasyon
// niyeti tespiti (completion-engine) tarafından paylaşılır.
// ---------------------------------------------------------------------------

import { embed, cosineSimilarity, type EmbeddingModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

const EMBEDDING_MODEL_ID = "text-embedding-3-small";

// Yalnızca BAŞARILI (API key mevcutken kurulan) model instance'ı önbelleğe
// alınır — "key yok" durumu kalıcı olarak önbelleklenmez, aksi halde key
// sonradan tanımlansa bile (dev hot-reload, test env stub'ları) hep null
// dönerdi.
let cachedModel: EmbeddingModel | null = null;

function getEmbeddingModel(): EmbeddingModel | null {
  if (cachedModel) return cachedModel;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const openai = createOpenAI({ apiKey });
  cachedModel = openai.embedding(EMBEDDING_MODEL_ID);
  return cachedModel;
}

/**
 * Metni embed eder. OPENAI_API_KEY yoksa veya API çağrısı başarısız olursa
 * null döner — çağıran taraf her zaman lexical/deterministik bir fallback'e
 * düşebilmeli (RAG hatası sohbeti asla kırmamalı).
 */
export async function embedText(text: string): Promise<number[] | null> {
  const model = getEmbeddingModel();
  if (!model || !text.trim()) return null;
  try {
    const { embedding } = await embed({ model, value: text });
    return embedding;
  } catch (err) {
    console.warn("[embeddings] embedText başarısız:", err);
    return null;
  }
}

export { cosineSimilarity };

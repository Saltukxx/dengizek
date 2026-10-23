// ---------------------------------------------------------------------------
// Yapay zeka model bağlantısı — Google Gemini API.
//
// GEMINI_API_KEY yoksa AI kapalıdır: sohbet 503 döner, embedding null döner ve
// çağıranlar kelime eşleşmesine düşer. Anahtar: https://aistudio.google.com
//
// Veri: Gemini'nin ÜCRETSİZ katmanında içerik Google tarafından ürün
// geliştirmede kullanılır. Gerçek misafir trafiğinden önce projede
// faturalandırma açılmalıdır (ücretli katmanda içerik eğitimde kullanılmaz).
// ---------------------------------------------------------------------------

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { APICallError, wrapLanguageModel, type EmbeddingModel, type LanguageModel } from "ai";

/**
 * Ekim 2026 ölçümü (aynı prompt, 3 deneme): 3.1 Flash-Lite ~1 sn, 3.5
 * Flash-Lite ~11 sn; 3.1 ayrıca daha ucuz (0,25 $ / 1,50 $ per 1M token).
 * Eval (src/lib/ai/evals) iki modelde de aynı sonucu verdi.
 */
export const DEFAULT_CHAT_MODEL = "gemini-3.1-flash-lite";
/**
 * Ana model kota (429), sunucu (5xx) veya "model kaldırıldı" (404) hatası
 * verirse istek bu modelle tekrarlanır — Google eski modelleri yeni
 * kullanıcılara kapatabiliyor (2.5'te oldu). AI_FALLBACK_MODEL=none kapatır.
 */
export const DEFAULT_FALLBACK_MODEL = "gemini-3.5-flash-lite";
export const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-2";

/**
 * hotel_fact_embeddings.embedding sütununun boyutu. gemini-embedding-2
 * 128–3072 arası boyut üretebilir; 1536 Google'ın önerdiği boyutlardandır ve
 * otomatik normalize edilir. Değişirse şema + migration + backfill gerekir.
 */
export const EMBEDDING_DIMENSIONS = 1536;

/** Sohbet çağrılarına eklenen sağlayıcı ayarları. */
export const CHAT_PROVIDER_OPTIONS = {
  google: {
    // 3.x Flash-Lite'ta düşünme kapatılamaz; düşünme token'ları çıktı olarak
    // faturalanır. Rehber yanıtları kısa olduğundan en düşük seviye yeterli.
    thinkingConfig: { thinkingLevel: "minimal" as const },
  },
};

/** Embedding çağrılarına eklenen sağlayıcı ayarları. */
export const EMBEDDING_PROVIDER_OPTIONS = {
  google: { outputDimensionality: EMBEDDING_DIMENSIONS },
};

export function isLlmConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function chatModelId(): string {
  return process.env.AI_CHAT_MODEL?.trim() || DEFAULT_CHAT_MODEL;
}

export function fallbackModelId(): string | null {
  const value = process.env.AI_FALLBACK_MODEL?.trim() || DEFAULT_FALLBACK_MODEL;
  return value === "none" || value === chatModelId() ? null : value;
}

export function embeddingModelId(): string {
  return process.env.AI_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
}

function getProvider() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return createGoogleGenerativeAI({ apiKey });
}

/** Yedek modele geçmeyi gerektiren hata mı? (Zaman aşımı/iptal değil.) */
export function shouldFallBack(error: unknown): boolean {
  if (!APICallError.isInstance(error)) return false;
  const status = error.statusCode ?? 0;
  return error.isRetryable || status === 404 || status === 429 || status >= 500;
}

export function getChatModel(): LanguageModel | null {
  const provider = getProvider();
  if (!provider) return null;
  const primary = provider.languageModel(chatModelId());
  const fallbackId = fallbackModelId();
  if (!fallbackId) return primary;
  const fallback = provider.languageModel(fallbackId);

  return wrapLanguageModel({
    model: primary,
    middleware: {
      specificationVersion: "v3",
      wrapGenerate: async ({ doGenerate, params }) => {
        try {
          return await doGenerate();
        } catch (error) {
          if (!shouldFallBack(error)) throw error;
          console.warn(`[llm] ${chatModelId()} başarısız, ${fallbackId} deneniyor:`, (error as Error).message);
          return fallback.doGenerate(params);
        }
      },
      wrapStream: async ({ doStream, params }) => {
        try {
          return await doStream();
        } catch (error) {
          if (!shouldFallBack(error)) throw error;
          console.warn(`[llm] ${chatModelId()} başarısız, ${fallbackId} deneniyor:`, (error as Error).message);
          return fallback.doStream(params);
        }
      },
    },
  });
}

export function getEmbeddingModel(): EmbeddingModel | null {
  return getProvider()?.embeddingModel(embeddingModelId()) ?? null;
}

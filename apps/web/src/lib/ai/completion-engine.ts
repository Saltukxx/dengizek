// ---------------------------------------------------------------------------
// Tur tamamlama motoru — deterministik sıradaki adım ve ilerleme
// ---------------------------------------------------------------------------

import { cosineSimilarity, embedText } from "@/lib/ai/embeddings";

export interface TourStepRef {
  stepId: string;
  title: string;
}

export interface CompletionState {
  nextStepId: string | null;
  nextStepTitle: string | null;
  seenCount: number;
  totalCount: number;
  progressRatio: number;
  isComplete: boolean;
  remainingStepIds: string[];
}

export function computeCompletionState(
  availableSteps: TourStepRef[],
  stepsSeen: string[],
  currentStepId?: string,
): CompletionState {
  const totalCount = availableSteps.length;
  const seenSet = new Set(stepsSeen);
  const seenCount = availableSteps.filter((s) => seenSet.has(s.stepId)).length;
  const remaining = availableSteps.filter((s) => !seenSet.has(s.stepId));
  const isComplete = totalCount > 0 && remaining.length === 0;

  let next = remaining[0] ?? null;
  if (!next && currentStepId) {
    const idx = availableSteps.findIndex((s) => s.stepId === currentStepId);
    if (idx >= 0 && idx < availableSteps.length - 1) {
      next = availableSteps[idx + 1] ?? null;
    }
  }

  const progressRatio = totalCount > 0 ? seenCount / totalCount : 0;

  return {
    nextStepId: next?.stepId ?? null,
    nextStepTitle: next?.title ?? null,
    seenCount,
    totalCount,
    progressRatio,
    isComplete,
    remainingStepIds: remaining.map((s) => s.stepId),
  };
}

/** Tur %80+ tamamlandı mı — openInquiry gate eşiği. */
export function canOpenInquiry(progressRatio: number): boolean {
  return progressRatio >= 0.8;
}

// Tek kelimelik, ASCII anahtar kelimeler — \b sınırıyla eşleşir ki
// "notebook"/"facebook" gibi alakasız kelimelerin içindeki "book" alt-dizesi
// yanlış pozitif üretmesin.
const INQUIRY_INTENT_WORD_PATTERNS = [
  /\brezervasyon\b/,
  /\btalep\b/,
  /\bbook(ing)?\b/,
  /\breserve\b/,
];

// Çok kelimeli veya Türkçe'ye özgü karakter içeren, kendi başına yeterince
// spesifik olduğu için düz alt-dize eşleşmesi güvenli olan ifadeler.
// NOT: bağımsız "ayırt"/"ayirt" kasıtlı olarak listede DEĞİL — "ayırt etmek"
// (= distinguish) ile "ayırtmak" (= reserve) fiilleri aynı kökü paylaşıyor;
// yalnızca "oda ayırt..." gibi daha spesifik kalıplar rezervasyon niyeti sayılır.
const INQUIRY_INTENT_PHRASES = [
  "fiyat teklifi",
  "teklif al",
  "konaklamak istiyorum",
  "oda ayirt",
  "oda ayırt",
  "ayırtmak istiyorum",
  "ayirtmak istiyorum",
];

/**
 * Kullanıcı açıkça talep/rezervasyon istiyor mu? — hızlı, deterministik ilk
 * kontrol. Anahtar kelime/kelime-sınırı eşleşmesi parafrazları kaçırabilir
 * (ör. "burayı tutabilir miyiz?") — bu durumlar için bkz. hasInquiryIntentSemantic.
 */
export function hasInquiryIntent(userMessage: string | undefined): boolean {
  if (!userMessage) return false;
  const lower = userMessage.toLowerCase();
  return (
    INQUIRY_INTENT_WORD_PATTERNS.some((re) => re.test(lower)) ||
    INQUIRY_INTENT_PHRASES.some((kw) => lower.includes(kw))
  );
}

// Anahtar kelime kontrolü kaçırdığında karşılaştırılacak küçük "rezervasyon
// niyeti" örnek cümle seti. Embedding'leri süreç ömrü boyunca bir kez
// hesaplanıp önbelleklenir (ilk çağrıda birkaç ekstra embed API isteği,
// sonrasında sıfır maliyet).
const INQUIRY_INTENT_EXEMPLARS = [
  "Bu odayı rezerve etmek istiyorum.",
  "Rezervasyon yapmak için ne yapmalıyım?",
  "Fiyat teklifi almak istiyorum, benim için talep oluşturur musunuz?",
  "Burayı tutmak istiyorum, nasıl ilerleyebiliriz?",
  "I would like to book this room.",
  "Can you help me make a reservation?",
];
// text-embedding-3-small için ampirik olarak seçilmiş, muhafazakâr bir eşik.
// Gerçek veriyle ayarlamak için: `npm run ai:threshold-report` (scripts/
// ai-threshold-report.ts) otel-başına guard/drift/inquiry oranlarını döker;
// erken-inquiry şikayeti yoksa ve blocked oranı yüksekse eşiği düşürün,
// tersi durumda yükseltin. Ortam değişkeniyle de geçersiz kılınabilir
// (AI_INQUIRY_INTENT_THRESHOLD) — deploy gerektirmeden A/B ayarı için.
const INQUIRY_INTENT_SIMILARITY_THRESHOLD = (() => {
  const raw = Number(process.env.AI_INQUIRY_INTENT_THRESHOLD);
  return Number.isFinite(raw) && raw > 0 && raw < 1 ? raw : 0.72;
})();

let exemplarEmbeddingsCache: number[][] | null = null;

async function getExemplarEmbeddings(): Promise<number[][]> {
  if (exemplarEmbeddingsCache) return exemplarEmbeddingsCache;
  const results = await Promise.all(INQUIRY_INTENT_EXEMPLARS.map((e) => embedText(e)));
  const embeddings = results.filter((e): e is number[] => e !== null);
  if (embeddings.length > 0) exemplarEmbeddingsCache = embeddings;
  return embeddings;
}

/**
 * hasInquiryIntent'in embedding tabanlı üst-versiyonu — bu turda zaten
 * hesaplanan kullanıcı-mesajı embedding'ini (context-router retrieval ile
 * paylaşılır) örnek cümle setiyle cosine benzerliğine göre değerlendirir.
 * Yalnızca hasInquiryIntent false dönerse çağrılmalı (ucuz senkron kontrol
 * önce denenir).
 */
export async function hasInquiryIntentSemantic(
  messageEmbedding: number[] | null | undefined,
): Promise<boolean> {
  if (!messageEmbedding) return false;
  const exemplars = await getExemplarEmbeddings();
  if (exemplars.length === 0) return false;
  return exemplars.some(
    (ex) => cosineSimilarity(messageEmbedding, ex) >= INQUIRY_INTENT_SIMILARITY_THRESHOLD,
  );
}

/** Tur adımı bittiğinde hangi tetikleyici gönderilecek. */
export function getStepEndTriggerReason(isAutoTour: boolean): "autoTourNext" | "stepEnd" {
  return isAutoTour ? "autoTourNext" : "stepEnd";
}

export function shouldAllowOpenInquiry(
  progressRatio: number,
  lastUserMessage?: string,
): boolean {
  return canOpenInquiry(progressRatio) || hasInquiryIntent(lastUserMessage);
}

/**
 * shouldAllowOpenInquiry'nin embedding-destekli sürümü — openInquiry tool'unun
 * execute()'unda (gerçek yetkilendirme noktası) kullanılır. Sync kontrol
 * yeterliyse embedding'e hiç bakmaz (ekstra API çağrısı yok).
 */
export async function shouldAllowOpenInquiryAsync(
  progressRatio: number,
  lastUserMessage: string | undefined,
  messageEmbedding: number[] | null | undefined,
): Promise<boolean> {
  if (shouldAllowOpenInquiry(progressRatio, lastUserMessage)) return true;
  return hasInquiryIntentSemantic(messageEmbedding);
}

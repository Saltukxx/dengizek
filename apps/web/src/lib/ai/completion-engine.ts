// ---------------------------------------------------------------------------
// Tur tamamlama motoru — deterministik sıradaki adım ve ilerleme
// ---------------------------------------------------------------------------

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

const INQUIRY_INTENT_KEYWORDS = [
  "rezervasyon",
  "talep",
  "fiyat teklifi",
  "teklif al",
  "book",
  "booking",
  "reserve",
  "ayirt",
  "ayırt",
  "konaklamak istiyorum",
  "oda ayirt",
  "oda ayırt",
];

/** Kullanıcı açıkça talep/rezervasyon istiyor mu? */
export function hasInquiryIntent(userMessage: string | undefined): boolean {
  if (!userMessage) return false;
  const lower = userMessage.toLowerCase();
  return INQUIRY_INTENT_KEYWORDS.some((kw) => lower.includes(kw));
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

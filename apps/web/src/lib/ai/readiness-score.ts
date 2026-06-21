// ---------------------------------------------------------------------------
// AI tur motoru hazırlık skoru — panel veri kalitesi
// ---------------------------------------------------------------------------

export const DEFAULT_AI_PERSONA = "Yapay Zeka Rehberi";

export interface ReadinessInput {
  aiPersona?: string | null;
  cancellationPolicy?: string | null;
  aiPolicies?: string[];
  tourSteps: { stepId: string; aiVisible?: boolean; aiDescription?: string | null }[];
  rooms: { name: string; priceOnRequest: boolean; priceMinor: number | null }[];
}

export interface ReadinessResult {
  score: number;
  issues: string[];
}

export function computeAiReadinessScore(input: ReadinessInput): ReadinessResult {
  const issues: string[] = [];
  let points = 0;
  const maxPoints = 4;

  const personaCustomized =
    Boolean(input.aiPersona?.trim()) && input.aiPersona!.trim() !== DEFAULT_AI_PERSONA;
  if (personaCustomized) {
    points += 1;
  } else {
    issues.push("AI persona adı özelleştirilmemiş (varsayılan değer).");
  }

  const visibleSteps = input.tourSteps.filter((s) => s.aiVisible !== false);
  const stepsWithDesc = visibleSteps.filter(
    (s) => (s.aiDescription?.trim().length ?? 0) >= 20,
  );
  if (visibleSteps.length === 0 || stepsWithDesc.length === visibleSteps.length) {
    points += 1;
  } else {
    issues.push(
      `${visibleSteps.length - stepsWithDesc.length} tur adımında AI açıklaması yetersiz (<20 karakter).`,
    );
  }

  if (input.rooms.length === 0) {
    issues.push("Yayında oda yok.");
  } else {
    const priced = input.rooms.every((r) => r.priceOnRequest || r.priceMinor != null);
    if (priced) points += 1;
    else issues.push("Bazı odalarda fiyat veya 'talep üzerine' tanımı eksik.");
  }

  const hasPolicy =
    Boolean(input.cancellationPolicy?.trim()) ||
    (input.aiPolicies?.length ?? 0) > 0;
  if (hasPolicy) points += 1;
  else issues.push("İptal/politika bilgisi eksik.");

  const score = Math.round((points / maxPoints) * 100);
  return { score, issues };
}

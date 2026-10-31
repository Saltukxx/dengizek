// ---------------------------------------------------------------------------
// AI tur motoru hazırlık skoru — panel veri kalitesi
//
// Kritik alanlar (critical verilirse): misafirin en çok sorduğu ve rehberin
// yalnız otelin verisinden cevaplayabildiği bilgiler — giriş/çıkış saati,
// evcil hayvan kuralı, yeme-içme konsepti, oda kapasiteleri. Bilgi yapısal
// alanda ya da otelin metinlerinde (ifade, politika) olabilir; rehber ikisini
// de kullanır, kontrol de ikisine bakar.
// ---------------------------------------------------------------------------

import { textsCoverTopic } from "@/lib/ai/deterministic-tools";
import { roomFacts } from "@/lib/import/oteldenrezerve-text";

export const DEFAULT_AI_PERSONA = "Yapay Zeka Rehberi";

export interface ReadinessInput {
  aiPersona?: string | null;
  cancellationPolicy?: string | null;
  aiPolicies?: string[];
  tourSteps: { stepId: string; aiVisible?: boolean; aiDescription?: string | null }[];
  rooms: { name: string; priceOnRequest: boolean; priceMinor: number | null }[];
  critical?: CriticalInput;
}

export interface CriticalInput {
  checkInTime?: string | null;
  checkOutTime?: string | null;
  petsAllowed?: boolean | null;
  /** Otelin serbest metinleri: ifadeler, politikalar, iptal/çocuk politikası. */
  texts: string[];
  rooms: Array<{ name: string; capacityAdults: number; capacityChildren: number; boardType: string | null; description?: string | null }>;
}

export interface CriticalGap {
  field: "giris-cikis" | "evcil-hayvan" | "yeme-icme" | "oda-kapasite";
  message: string;
}

/** Açıklamada yazan kapasite (yetişkin + çocuk toplamı) — yoksa null. */
function statedCapacity(description: string): number | null {
  const facts = roomFacts(description);
  if (facts.capacityAdults != null) return facts.capacityAdults + (facts.capacityChildren ?? 0);
  const kisilik = description.match(/(\d{1,2})\s*ki[şs]ilik/i)?.[1];
  return kisilik ? Number(kisilik) : null;
}

/** Rehberin cevaplayamayacağı kritik bilgiler. */
export function criticalGaps(input: CriticalInput): CriticalGap[] {
  const gaps: CriticalGap[] = [];
  const hasIn = Boolean(input.checkInTime?.trim()) || textsCoverTopic("checkIn", input.texts);
  const hasOut = Boolean(input.checkOutTime?.trim()) || textsCoverTopic("checkOut", input.texts);
  if (!hasIn || !hasOut) {
    const missing = [!hasIn && "giriş", !hasOut && "çıkış"].filter(Boolean).join(" ve ");
    gaps.push({ field: "giris-cikis", message: `${missing[0]!.toUpperCase()}${missing.slice(1)} saati belirtilmemiş — misafir sorarsa rehber "bilgim yok" der.` });
  }
  if (input.petsAllowed == null && !textsCoverTopic("pets", input.texts)) {
    gaps.push({ field: "evcil-hayvan", message: "Evcil hayvan kuralı belirtilmemiş." });
  }
  const boardKnown = input.rooms.some((r) => r.boardType && r.boardType !== "sadece-oda") || textsCoverTopic("board", input.texts);
  if (!boardKnown) {
    gaps.push({ field: "yeme-icme", message: "Yeme-içme konsepti (oda kahvaltı, yarım pansiyon…) belirtilmemiş." });
  }
  const mismatched = input.rooms.filter((r) => {
    const stated = r.description ? statedCapacity(r.description) : null;
    return stated != null && stated !== r.capacityAdults + r.capacityChildren;
  });
  if (mismatched.length) {
    gaps.push({
      field: "oda-kapasite",
      message: `${mismatched.map((r) => `“${r.name}”`).join(", ")} kapasitesi açıklamadakiyle uyuşmuyor — rehber kapasite alanını söyler.`,
    });
  }
  return gaps;
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

  // Kritik alanlar: dört kontrol, her biri bir puan.
  let max = maxPoints;
  if (input.critical) {
    const gaps = criticalGaps(input.critical);
    max += 4;
    points += 4 - gaps.length;
    issues.unshift(...gaps.map((g) => g.message));
  }

  const score = Math.round((points / max) * 100);
  return { score, issues };
}

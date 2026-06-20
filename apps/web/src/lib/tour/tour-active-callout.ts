import type { TourCallout, TourCalloutPlacement } from "@/lib/schemas/tour-manifest";

export const DEFAULT_CALLOUT_PLACEMENT: TourCalloutPlacement = "bottomStart";

/**
 * tSec'e göre en son 'açılmış' callout: zaman çizgisi sürerken cümleler sırayla görünür.
 */
export function getActiveCallout(
  callouts: TourCallout[] | undefined,
  currentTimeSec: number,
): TourCallout | null {
  if (!callouts?.length) return null;
  const sorted = [...callouts].sort((a, b) => a.tSec - b.tSec);
  let active: TourCallout | null = null;
  for (const c of sorted) {
    if (currentTimeSec + 0.01 >= c.tSec) active = c;
    else break;
  }
  return active;
}

/**
 * Başlama anı geçmiş tüm callout'lar (tam ekranda aynı anda, konumlara göre).
 */
export function getVisibleCallouts(
  callouts: TourCallout[] | undefined,
  currentTimeSec: number,
): TourCallout[] {
  if (!callouts?.length) return [];
  return [...callouts]
    .filter((c) => currentTimeSec + 0.01 >= c.tSec)
    .sort((a, b) => a.tSec - b.tSec);
}

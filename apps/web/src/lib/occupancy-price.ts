// ---------------------------------------------------------------------------
// Kişi sayısına göre dönemsel fiyat yardımcıları
// ---------------------------------------------------------------------------

import { toMajor, toMinor } from "@/lib/price";

export interface OccupancyPrice {
  guestCount: number;
  priceMinor: number;
}

export interface OccupancyPriceForm {
  guestCount: number | null;
  priceMajor: number | null;
}

export function occupancyFromApi(list: OccupancyPrice[] | null | undefined): OccupancyPriceForm[] {
  return (list ?? [])
    .slice()
    .sort((a, b) => a.guestCount - b.guestCount)
    .map((p) => ({
      guestCount: p.guestCount,
      priceMajor: toMajor(p.priceMinor),
    }));
}

export function occupancyToApi(list: OccupancyPriceForm[]): OccupancyPrice[] {
  return list
    .filter((p) => p.guestCount != null && p.guestCount > 0 && p.priceMajor != null && p.priceMajor > 0)
    .map((p) => ({
      guestCount: p.guestCount as number,
      priceMinor: toMinor(p.priceMajor as number),
    }))
    .sort((a, b) => a.guestCount - b.guestCount);
}


export function formatOccupancySummary(
  rate: { priceMinor: number; currency: string; occupancyPrices?: OccupancyPrice[] | null },
  formatPrice: (minor: number, currency: string, onRequest: boolean) => string,
): string {
  const tiers = (rate.occupancyPrices ?? []).slice().sort((a, b) => a.guestCount - b.guestCount);
  if (tiers.length === 0) return "";
  return tiers
    .map((p) => `${p.guestCount} kişi ${formatPrice(p.priceMinor, rate.currency, false)}`)
    .join(" · ");
}

export function validateOccupancyForms(list: OccupancyPriceForm[]): string | null {
  const counts = list
    .filter((p) => p.guestCount != null && p.priceMajor != null && p.priceMajor > 0)
    .map((p) => p.guestCount as number);
  if (new Set(counts).size !== counts.length) {
    return "Aynı kişi sayısı için birden fazla fiyat olamaz.";
  }
  for (const p of list) {
    if (p.guestCount == null && p.priceMajor == null) continue;
    if (p.guestCount == null || p.guestCount < 1) return "Geçerli kişi sayısı girin.";
    if (p.priceMajor == null || p.priceMajor <= 0) return "Geçerli kişi fiyatı girin.";
  }
  return null;
}

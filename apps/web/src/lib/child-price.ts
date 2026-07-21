// ---------------------------------------------------------------------------
// Yaş aralığına göre çocuk fiyatı yardımcıları
// ---------------------------------------------------------------------------

import { toMajor, toMinor } from "@/lib/price";

export type ChildPriceMode = "ucretsiz" | "sabit" | "yuzde";

export const childPriceModeLabels: Record<ChildPriceMode, string> = {
  ucretsiz: "Ücretsiz",
  sabit: "Sabit tutar",
  yuzde: "Yetişkin fiyatının yüzdesi",
};

export interface ChildAgePrice {
  ageFrom: number;
  ageTo: number;
  mode: ChildPriceMode;
  priceMinor?: number | null;
  percent?: number | null;
}

export interface ChildAgePriceForm {
  ageFrom: number | null;
  ageTo: number | null;
  mode: ChildPriceMode;
  priceMajor: number | null;
  percent: number | null;
}

export function childAgePricesFromApi(list: ChildAgePrice[] | null | undefined): ChildAgePriceForm[] {
  return (list ?? [])
    .slice()
    .sort((a, b) => a.ageFrom - b.ageFrom)
    .map((p) => ({
      ageFrom: p.ageFrom,
      ageTo: p.ageTo,
      mode: p.mode,
      priceMajor: p.priceMinor != null ? toMajor(p.priceMinor) : null,
      percent: p.percent ?? null,
    }));
}

export function childAgePricesToApi(list: ChildAgePriceForm[]): ChildAgePrice[] {
  return list
    .filter((p) => p.ageFrom != null && p.ageTo != null)
    .map((p) => ({
      ageFrom: p.ageFrom as number,
      ageTo: p.ageTo as number,
      mode: p.mode,
      priceMinor: p.mode === "sabit" && p.priceMajor != null ? toMinor(p.priceMajor) : null,
      percent: p.mode === "yuzde" ? p.percent : null,
    }))
    .sort((a, b) => a.ageFrom - b.ageFrom);
}

export function formatChildAgePriceSummary(
  list: ChildAgePrice[] | null | undefined,
  formatPrice: (minor: number, currency: string, onRequest: boolean) => string,
  currency: string,
): string {
  const bands = (list ?? []).slice().sort((a, b) => a.ageFrom - b.ageFrom);
  if (bands.length === 0) return "";
  return bands
    .map((b) => {
      const range = b.ageFrom === b.ageTo ? `${b.ageFrom} yaş` : `${b.ageFrom}-${b.ageTo} yaş`;
      if (b.mode === "ucretsiz") return `${range} ücretsiz`;
      if (b.mode === "yuzde") return `${range} %${b.percent ?? 0}`;
      return `${range} ${formatPrice(b.priceMinor ?? 0, currency, false)}`;
    })
    .join(" · ");
}

export function validateChildAgePrices(list: ChildAgePriceForm[]): string | null {
  for (const p of list) {
    if (p.ageFrom == null || p.ageTo == null) return "Yaş aralığını girin.";
    if (p.ageFrom < 0 || p.ageTo > 17) return "Yaş 0-17 arasında olmalı.";
    if (p.ageFrom > p.ageTo) return "Bitiş yaşı başlangıçtan küçük olamaz.";
    if (p.mode === "sabit" && (p.priceMajor == null || p.priceMajor < 0)) return "Sabit tutar girin.";
    if (p.mode === "yuzde" && (p.percent == null || p.percent < 1 || p.percent > 100)) return "Yüzde 1-100 arasında olmalı.";
  }
  const bands = list.filter((p) => p.ageFrom != null && p.ageTo != null).slice().sort((a, b) => (a.ageFrom as number) - (b.ageFrom as number));
  for (let i = 1; i < bands.length; i++) {
    if ((bands[i].ageFrom as number) <= (bands[i - 1].ageTo as number)) {
      return "Yaş aralıkları çakışamaz.";
    }
  }
  return null;
}

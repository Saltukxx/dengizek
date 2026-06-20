// ---------------------------------------------------------------------------
// Fiyat yardımcıları — tutarlar en küçük birimde (kuruş/cent) saklanır.
// ---------------------------------------------------------------------------

export const currencies = ["TRY", "EUR", "USD"] as const;
export type Currency = (typeof currencies)[number];

export const currencyLabels: Record<Currency, string> = {
  TRY: "₺ Türk Lirası",
  EUR: "€ Euro",
  USD: "$ ABD Doları",
};

/**
 * Fiyatı Türkçe yerel ayarla biçimler.
 * priceOnRequest veya tutar yoksa "Talep üzerine" döner.
 * Örn: formatPrice(450000, "TRY") → "₺4.500"
 */
export function formatPrice(
  priceMinor: number | null | undefined,
  currency: string = "TRY",
  priceOnRequest: boolean = false,
): string {
  if (priceOnRequest || priceMinor === null || priceMinor === undefined) {
    return "Talep üzerine";
  }
  const major = priceMinor / 100;
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    minimumFractionDigits: major % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(major);
}

/** Kullanıcı girdisini (ondalık ana birim) en küçük birime çevirir. */
export function toMinor(major: number): number {
  return Math.round(major * 100);
}

/** En küçük birimi ondalık ana birime çevirir (form gösterimi için). */
export function toMajor(minor: number): number {
  return minor / 100;
}

// ---------------------------------------------------------------------------
// İskonto ve dönemsel fiyat çözümleme
// ---------------------------------------------------------------------------

/** Yüzde iskontoyu uygular (en küçük birime yuvarlanır). */
export function applyDiscount(priceMinor: number, discountPercent: number): number {
  return Math.round(priceMinor * (1 - discountPercent / 100));
}

export interface RateLike {
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  priceMinor: number;
  currency: string;
  minStayNights?: number | null;
}

export interface ResolvedRate {
  priceMinor: number | null;
  currency: string;
  priceOnRequest: boolean;
  /** Fiyat bir dönemden geliyorsa dönemin adı */
  rateName?: string;
  minStayNights?: number | null;
}

/** Bugünün tarihi YYYY-MM-DD (yerel saat). */
export function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Verilen tarihte geçerli fiyatı çözer: tarih bir döneme düşüyorsa dönem
 * fiyatı (çakışmada başlangıcı en geç olan kazanır), yoksa baz fiyat.
 */
export function resolveCurrentRate(
  room: {
    priceMinor: number | null;
    currency: string;
    priceOnRequest: boolean;
    minStayNights?: number | null;
  },
  rates: RateLike[],
  date: string = todayIso(),
): ResolvedRate {
  const active = rates
    .filter((r) => r.startDate <= date && date <= r.endDate)
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  const winner = active[0];
  if (winner) {
    return {
      priceMinor: winner.priceMinor,
      currency: winner.currency,
      priceOnRequest: false,
      rateName: winner.name,
      minStayNights: winner.minStayNights ?? room.minStayNights ?? null,
    };
  }
  return {
    priceMinor: room.priceMinor,
    currency: room.currency,
    priceOnRequest: room.priceOnRequest,
    minStayNights: room.minStayNights ?? null,
  };
}

/** "2026-06-01", "2026-09-15" → "1 Haziran – 15 Eylül 2026" */
export function formatDateRangeTr(startDate: string, endDate: string): string {
  const fmt = (iso: string, withYear: boolean) => {
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return new Intl.DateTimeFormat("tr-TR", {
      day: "numeric",
      month: "long",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    }).format(date);
  };
  const sameYear = startDate.slice(0, 4) === endDate.slice(0, 4);
  return `${fmt(startDate, !sameYear)} – ${fmt(endDate, true)}`;
}

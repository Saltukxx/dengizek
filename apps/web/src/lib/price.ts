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

export interface OccupancyPriceLike {
  guestCount: number;
  priceMinor: number;
}

export interface ChildAgePriceLike {
  ageFrom: number;
  ageTo: number;
  mode: "ucretsiz" | "sabit" | "yuzde";
  priceMinor?: number | null;
  percent?: number | null;
  /**
   * Kaçıncı çocuğa uygulanır: 1 → yalnız 1. çocuk, 2 → 2. ve sonraki
   * çocuklar; boş → her çocuk. Çocuklar yaşa göre büyükten küçüğe sıralanır
   * (en büyük çocuk 1. çocuktur).
   */
  childOrder?: 1 | 2 | null;
}

export interface RateLike {
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  priceMinor: number;
  currency: string;
  minStayNights?: number | null;
  occupancyPrices?: OccupancyPriceLike[];
  childAgePrices?: ChildAgePriceLike[];
  /**
   * Dönem yalnız bu gecelerde geçerli (0 Pazar … 6 Cumartesi; gecenin
   * tarihine göre — Cuma gecesi = Cuma). Boş → her gece.
   */
  weekdays?: number[] | null;
  /** Dönem yalnız konaklama en az / en fazla bu kadar geceyse geçerli. */
  stayMinNights?: number | null;
  stayMaxNights?: number | null;
}

/** Gecenin haftanın hangi günü olduğu (0 Pazar … 6 Cumartesi). */
export function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00.000Z`).getUTCDay();
}

/** Koşulsuz dönem 0; gün ve konaklama süresi koşulu taşıyanlar daha özeldir. */
function rateSpecificity(rate: RateLike): number {
  return (rate.weekdays?.length ? 1 : 0) + (rate.stayMinNights != null || rate.stayMaxNights != null ? 2 : 0);
}

/**
 * Bu gece için geçerli dönem. Koşullar: tarih aralığı, gece (haftanın günü)
 * ve konaklama süresi. Konaklama süresi bilinmiyorsa (ör. "bugünkü fiyat")
 * süre koşullu dönemler uygulanmaz. Birden fazla dönem geçerliyse önce daha
 * özel olan (koşullu), sonra başlangıcı en geç olan kazanır — böylece
 * "Cuma-Cumartesi" ya da "tek gece Cumartesi" dönemi ana dönemin üstüne
 * yazılabilir.
 */
export function pickRate<R extends RateLike>(rates: R[], date: string, nights?: number | null): R | undefined {
  const day = weekdayOf(date);
  return rates
    .filter((r) => {
      if (!(r.startDate <= date && date <= r.endDate)) return false;
      if (r.weekdays?.length && !r.weekdays.includes(day)) return false;
      if (r.stayMinNights != null || r.stayMaxNights != null) {
        if (nights == null) return false;
        if (r.stayMinNights != null && nights < r.stayMinNights) return false;
        if (r.stayMaxNights != null && nights > r.stayMaxNights) return false;
      }
      return true;
    })
    .sort((a, b) => rateSpecificity(b) - rateSpecificity(a) || (a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0))[0];
}

/** Kişi sayısına göre dönem fiyatını çözer; eşleşme yoksa baz fiyat döner. */
export function resolveRatePriceForGuests(
  rate: { priceMinor: number; occupancyPrices?: OccupancyPriceLike[] | null },
  guestCount?: number | null,
): number {
  if (guestCount != null && guestCount > 0 && rate.occupancyPrices?.length) {
    const match = rate.occupancyPrices.find((p) => p.guestCount === guestCount);
    if (match) return match.priceMinor;
  }
  return rate.priceMinor;
}

export interface ResolvedRate {
  priceMinor: number | null;
  currency: string;
  priceOnRequest: boolean;
  /** Fiyat bir dönemden geliyorsa dönemin adı */
  rateName?: string;
  minStayNights?: number | null;
}

/**
 * Uygulamanın "takvim günü" saat dilimi. Sunucu yerel saati kullanılırsa
 * (Vercel'de UTC) sezon ve kampanya geçişleri Türkiye saatiyle 03:00'te olur.
 */
export const APP_TIMEZONE = process.env.APP_TIMEZONE || "Europe/Istanbul";

/** Bugünün tarihi YYYY-MM-DD — otelin saat dilimine göre. */
export function todayIso(now: Date = new Date(), timeZone: string = APP_TIMEZONE): string {
  // en-CA yerel ayarı zaten YYYY-MM-DD üretir.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
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
  guestCount?: number | null,
  nights?: number | null,
): ResolvedRate {
  const winner = pickRate(rates, date, nights);
  if (winner) {
    return {
      priceMinor: resolveRatePriceForGuests(winner, guestCount),
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

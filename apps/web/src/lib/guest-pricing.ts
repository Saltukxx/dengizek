// ---------------------------------------------------------------------------
// Misafir fiyat çözümleme — promotion > rate plan > seasonal > base+discount
// ---------------------------------------------------------------------------

import {
  applyDiscount,
  pickRate,
  resolveCurrentRate,
  weekdayOf,
  resolveRatePriceForGuests,
  todayIso,
  type ChildAgePriceLike,
  type OccupancyPriceLike,
  type RateLike,
  type ResolvedRate,
} from "@/lib/price";

/** "X kal Y öde" basamağı: stay gece kalana pay gece ücreti. */
export interface StayPayTier {
  stay: number;
  pay: number;
}

/** Ücretsiz gecelerin hangi gecelerden düşüleceği. */
export type FreeNightRule = "hafta_ici" | "en_ucuz";

export interface GuestPromotion {
  /** Kayıt kimliği (kontenjan hesabı için); eski verilerde olmayabilir. */
  id?: string;
  name: string;
  /** Yüzde indirim; kal-öde kampanyasında boş. */
  discountPercent: number | null;
  /**
   * Doluysa kampanya kal-öde türündedir: gece gece değil konaklamanın
   * tamamına uygulanır (bkz. quoteStayNights). Konaklamanın bütün geceleri
   * validFrom–validTo içinde olmalıdır.
   */
  stayPayTiers?: StayPayTier[] | null;
  freeNightRule?: FreeNightRule | null;
  /** Konaklama en fazla bu kadar geceyse (ör. "2 ve 3 gece için"). */
  maxNights?: number | null;
  /** Rezervasyon (bugün) bu aralıkta olmalı — erken / son rezervasyon. */
  bookableFrom?: string | null;
  bookableTo?: string | null;
  /** Oda tipi başına gecelik kampanya kontenjanı. */
  allotment?: number | null;
  /** Kontenjanı dolmuş geceler: oda kimliği → tarihler (canlı rezervasyonlardan). */
  soldOut?: Record<string, string[]> | null;
  validFrom: string | null;
  validTo: string | null;
  minNights: number | null;
  roomIds: string[];
  isActive: boolean;
}

export interface GuestRatePlanPrice {
  roomId: string;
  name: string;
  startDate: string;
  endDate: string;
  priceMinor: number;
  currency: string;
  minStayNights: number | null;
  /** Kişi sayısına göre gecelik fiyatlar — eşleşme yoksa priceMinor kullanılır. */
  occupancyPrices?: OccupancyPriceLike[] | null;
}

export interface GuestRoomPricingInput {
  room: {
    id: string;
    priceMinor: number | null;
    currency: string;
    priceOnRequest: boolean;
    discountPercent: number | null;
    discountLabel: string | null;
    minStayNights?: number | null;
    childAgePrices?: ChildAgePriceLike[] | null;
  };
  rates: RateLike[];
  promotions?: GuestPromotion[];
  ratePlanPrices?: GuestRatePlanPrice[];
  date?: string;
  nights?: number;
  guestCount?: number | null;
  /** Rezervasyonun yapıldığı gün (kampanyanın rezervasyon aralığı için); varsayılan bugün. */
  bookingDate?: string;
  /** Çocukların yaşları — verilirse gecelik fiyata yaş bazlı ek/indirim uygulanır. */
  childAges?: number[] | null;
}

export type GuestPriceSource = "promotion" | "rate_plan" | "seasonal" | "base";

export interface GuestChildPriceLine {
  age: number;
  priceMinor: number;
}

export interface GuestRoomPrice extends ResolvedRate {
  originalPriceMinor: number | null;
  discountPercent: number | null;
  discountLabel: string | null;
  source: GuestPriceSource;
  promotionName?: string;
  hasCampaign: boolean;
  /** childAges verildiyse: çocuklar için toplam ek tutar (en küçük birim) */
  childSurchargeMinor?: number;
  /** childAges verildiyse: her çocuk için ayrı ayrı gecelik tutar */
  childBreakdown?: GuestChildPriceLine[];
}

/** Kampanyanın konaklamadan bağımsız koşulları: durum, oda, rezervasyon tarihi, süre. */
function promotionAppliesTo(promo: GuestPromotion, roomId: string, nights: number, bookingDate: string): boolean {
  if (!promo.isActive) return false;
  if (promo.roomIds.length > 0 && !promo.roomIds.includes(roomId)) return false;
  if (promo.bookableFrom && bookingDate < promo.bookableFrom) return false;
  if (promo.bookableTo && bookingDate > promo.bookableTo) return false;
  if (promo.minNights != null && nights < promo.minNights) return false;
  if (promo.maxNights != null && nights > promo.maxNights) return false;
  return true;
}

function isSoldOut(promo: GuestPromotion, roomId: string, date: string): boolean {
  return Boolean(promo.soldOut?.[roomId]?.includes(date));
}

function isPromotionActive(
  promo: GuestPromotion,
  roomId: string,
  date: string,
  nights: number,
  bookingDate: string,
): boolean {
  // Kal-öde gece fiyatına değil konaklama toplamına uygulanır.
  if (promo.stayPayTiers?.length || !promo.discountPercent) return false;
  if (!promotionAppliesTo(promo, roomId, nights, bookingDate)) return false;
  if (promo.validFrom && date < promo.validFrom) return false;
  if (promo.validTo && date > promo.validTo) return false;
  return !isSoldOut(promo, roomId, date);
}

function resolveRatePlanPrice(
  prices: GuestRatePlanPrice[],
  roomId: string,
  date: string,
  roomMinStay: number | null | undefined,
  guestCount?: number | null,
): ResolvedRate | null {
  const active = prices
    .filter((p) => p.roomId === roomId && p.startDate <= date && date <= p.endDate)
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  const winner = active[0];
  if (!winner) return null;
  return {
    // Dönemsel fiyatlarla aynı kişi-sayısı çözümlemesi (bkz. room_rates).
    priceMinor: resolveRatePriceForGuests(winner, guestCount),
    currency: winner.currency,
    priceOnRequest: false,
    rateName: winner.name,
    minStayNights: winner.minStayNights ?? roomMinStay ?? null,
  };
}

function resolveUnderlyingPrice(
  input: GuestRoomPricingInput,
  date: string,
): ResolvedRate {
  const plan = resolveRatePlanPrice(
    input.ratePlanPrices ?? [],
    input.room.id,
    date,
    input.room.minStayNights,
    input.guestCount,
  );
  if (plan) return plan;

  const seasonal = resolveCurrentRate(input.room, input.rates, date, input.guestCount, input.nights);
  if (seasonal.rateName) return seasonal;

  return {
    priceMinor: input.room.priceMinor,
    currency: input.room.currency,
    priceOnRequest: input.room.priceOnRequest,
    minStayNights: input.room.minStayNights ?? null,
  };
}

function resolveActiveChildAgePrices(
  room: { childAgePrices?: ChildAgePriceLike[] | null },
  rates: RateLike[],
  date: string,
  nights?: number | null,
): ChildAgePriceLike[] {
  // Fiyatı belirleyen dönemle aynı seçim (gün / süre koşulları dahil).
  const winner = pickRate(rates, date, nights);
  if (winner?.childAgePrices?.length) return winner.childAgePrices;
  return room.childAgePrices ?? [];
}

/**
 * Yaş ve sıraya göre gecelik çocuk fiyatı. `order` 0 tabanlı çocuk sırasıdır
 * (0 → 1. çocuk). Sıra koşullu bant (ör. "2-5 yaş 1. çocuk ücretsiz") genel
 * banttan önce gelir. Eşleşme yoksa yetişkin fiyatından ücretlendirilir.
 */
function resolveChildNightlyPrice(
  age: number,
  order: number,
  bands: ChildAgePriceLike[],
  adultNightlyMinor: number,
): number {
  const inAge = bands.filter((b) => age >= b.ageFrom && age <= b.ageTo);
  const orderMatches = (b: ChildAgePriceLike) =>
    b.childOrder === 1 ? order === 0 : b.childOrder === 2 ? order >= 1 : true;
  const band = inAge.find((b) => b.childOrder != null && orderMatches(b)) ?? inAge.find((b) => b.childOrder == null);
  if (!band) return adultNightlyMinor;
  if (band.mode === "ucretsiz") return 0;
  if (band.mode === "sabit") return band.priceMinor ?? 0;
  return Math.round((adultNightlyMinor * (band.percent ?? 0)) / 100);
}

/** Aktif kampanya, fiyat planı, dönem veya baz fiyattan misafir fiyatını çözer. */
export function resolveGuestRoomPrice(input: GuestRoomPricingInput): GuestRoomPrice {
  const base = resolveBaseGuestRoomPrice(input);
  const childAges = input.childAges;
  if (!childAges?.length || base.priceOnRequest || base.priceMinor == null) {
    return base;
  }

  const date = input.date ?? todayIso();
  const bands = resolveActiveChildAgePrices(input.room, input.rates, date, input.nights);
  // "Yetişkin fiyatı" bir yetişkinin gecelik payıdır: oda fiyatı yetişkin
  // sayısına bölünür (kişi başı fiyatlanan otelde %50 = yarım kişi). Yetişkin
  // sayısı bilinmiyorsa oda fiyatı kullanılır.
  const adults = input.guestCount != null && input.guestCount > 0 ? input.guestCount : 1;
  const adultNightlyMinor = Math.round((base.priceMinor as number) / adults);
  // 1. çocuk en büyük çocuktur; döküm misafirin verdiği sırada kalır.
  const orderByAge = childAges
    .map((age, index) => ({ age, index }))
    .sort((a, b) => b.age - a.age || a.index - b.index);
  const orderOf = new Map(orderByAge.map((c, order) => [c.index, order]));
  const childBreakdown: GuestChildPriceLine[] = childAges.map((age, index) => ({
    age,
    priceMinor: resolveChildNightlyPrice(age, orderOf.get(index) ?? index, bands, adultNightlyMinor),
  }));
  const childSurchargeMinor = childBreakdown.reduce((sum, c) => sum + c.priceMinor, 0);

  // originalPriceMinor da çocuk ücretini içermeli: aksi halde üstü çizili
  // "normal fiyat" indirimli fiyattan DÜŞÜK görünür (ör. AI fiyat kartında
  // "indirimli 3.000₺, normal 2.000₺").
  return {
    ...base,
    priceMinor: (base.priceMinor as number) + childSurchargeMinor,
    originalPriceMinor:
      base.originalPriceMinor == null ? null : base.originalPriceMinor + childSurchargeMinor,
    childSurchargeMinor,
    childBreakdown,
  };
}

function resolveBaseGuestRoomPrice(input: GuestRoomPricingInput): GuestRoomPrice {
  const date = input.date ?? todayIso();
  const nights = input.nights ?? 1;
  const promotions = input.promotions ?? [];

  // Birden fazla kampanya geçerliyse misafir lehine olan (en yüksek indirim)
  // kazanır — aksi halde dizi sırası (pratikte en eski kampanya) belirlerdi.
  const activePromo = promotions
    .filter((p) => isPromotionActive(p, input.room.id, date, nights, input.bookingDate ?? todayIso()))
    .reduce<GuestPromotion | undefined>(
      (best, p) => (best == null || (p.discountPercent ?? 0) > (best.discountPercent ?? 0) ? p : best),
      undefined,
    );
  if (activePromo) {
    const underlying = resolveUnderlyingPrice(input, date);
    if (!underlying.priceOnRequest && underlying.priceMinor != null) {
      return {
        ...underlying,
        originalPriceMinor: underlying.priceMinor,
        priceMinor: applyDiscount(underlying.priceMinor, activePromo.discountPercent as number),
        discountPercent: activePromo.discountPercent,
        discountLabel: activePromo.name,
        source: "promotion",
        promotionName: activePromo.name,
        hasCampaign: true,
      };
    }
  }

  const plan = resolveRatePlanPrice(
    input.ratePlanPrices ?? [],
    input.room.id,
    date,
    input.room.minStayNights,
    input.guestCount,
  );
  if (plan) {
    return {
      ...plan,
      originalPriceMinor: plan.priceMinor,
      discountPercent: null,
      discountLabel: null,
      source: "rate_plan",
      hasCampaign: false,
    };
  }

  const seasonal = resolveCurrentRate(input.room, input.rates, date, input.guestCount, input.nights);
  if (seasonal.rateName) {
    const hasDiscount =
      !seasonal.priceOnRequest &&
      seasonal.priceMinor != null &&
      input.room.discountPercent != null;
    return {
      ...seasonal,
      originalPriceMinor: seasonal.priceMinor,
      priceMinor: hasDiscount
        ? applyDiscount(seasonal.priceMinor as number, input.room.discountPercent as number)
        : seasonal.priceMinor,
      discountPercent: hasDiscount ? input.room.discountPercent : null,
      discountLabel: hasDiscount
        ? (input.room.discountLabel ?? `%${input.room.discountPercent} indirim`)
        : null,
      source: "seasonal",
      hasCampaign: hasDiscount,
    };
  }

  const hasDiscount =
    !input.room.priceOnRequest &&
    input.room.priceMinor != null &&
    input.room.discountPercent != null;

  return {
    priceMinor: hasDiscount
      ? applyDiscount(input.room.priceMinor as number, input.room.discountPercent as number)
      : input.room.priceMinor,
    currency: input.room.currency,
    priceOnRequest: input.room.priceOnRequest,
    minStayNights: input.room.minStayNights ?? null,
    originalPriceMinor: input.room.priceMinor,
    discountPercent: hasDiscount ? input.room.discountPercent : null,
    discountLabel: hasDiscount
      ? (input.room.discountLabel ?? `%${input.room.discountPercent} indirim`)
      : null,
    source: "base",
    hasCampaign: hasDiscount,
  };
}

// ---------------------------------------------------------------------------
// Konaklama toplamı — gece gece fiyat + kal-öde kampanyaları
// ---------------------------------------------------------------------------

export interface StayNightLine {
  date: string;
  priceMinor: number;
  /** Kal-öde kampanyasıyla ücretsiz olan gece. */
  free: boolean;
}

export interface StayNightsQuote {
  /** Fiyatlanan geceler; bir gece fiyatlanamadıysa toplam null olur. */
  nights: StayNightLine[];
  totalMinor: number | null;
  /** Kampanyasız toplam — yalnız toplamdan büyükse dolu. */
  originalTotalMinor: number | null;
  currency: string;
  /** Uygulanan kampanyanın adı (yüzde ya da kal-öde). */
  discountLabel: string | null;
  /** Kal-öde uygulandıysa: kampanya adı ve ücretsiz gece sayısı. */
  stayPromotion: { name: string; freeNights: number } | null;
  /** Gecelerin istediği en uzun minimum konaklama. */
  minStayNights: number;
  /** Fiyatı olmayan ilk gece (talep üzerine). */
  unpricedDate: string | null;
  /** Geceler farklı para birimindeyse toplam alınmaz. */
  mixedCurrency: boolean;
  /** İlk gecenin çözümü (çocuk dökümü ve dönem adı için). */
  firstNight: GuestRoomPrice | null;
}

function isWeekdayNight(date: string): boolean {
  // Pazar–Perşembe geceleri hafta içidir; Cuma ve Cumartesi hafta sonu.
  const day = weekdayOf(date);
  return day >= 0 && day <= 4;
}

/** Konaklama süresine uyan en büyük basamak. */
function stayPayTierFor(tiers: StayPayTier[], nights: number): StayPayTier | undefined {
  return tiers
    .filter((t) => t.stay <= nights && t.pay < t.stay)
    .sort((a, b) => b.stay - a.stay)[0];
}

/** Ücretsiz sayılacak gecelerin sıraları: kurala göre en ucuzdan başlayarak. */
function pickFreeNights(prices: { date: string; priceMinor: number }[], count: number, rule: FreeNightRule): Set<number> {
  const ranked = prices
    .map((p, index) => ({ ...p, index }))
    .sort((a, b) => {
      if (rule === "hafta_ici") {
        const wa = isWeekdayNight(a.date) ? 0 : 1;
        const wb = isWeekdayNight(b.date) ? 0 : 1;
        if (wa !== wb) return wa - wb;
      }
      return a.priceMinor - b.priceMinor || a.index - b.index;
    });
  return new Set(ranked.slice(0, count).map((p) => p.index));
}

function isStayPayActive(promo: GuestPromotion, roomId: string, dates: string[], bookingDate: string): boolean {
  if (!promo.stayPayTiers?.length) return false;
  if (!promotionAppliesTo(promo, roomId, dates.length, bookingDate)) return false;
  if (dates.some((date) => isSoldOut(promo, roomId, date))) return false;
  // Konaklamanın tamamı kampanya dönemi içinde olmalı.
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!first || !last) return false;
  if (promo.validFrom && first < promo.validFrom) return false;
  if (promo.validTo && last > promo.validTo) return false;
  return Boolean(stayPayTierFor(promo.stayPayTiers, dates.length));
}

/**
 * Bir odanın konaklama toplamı. Her gece kendi dönemi, kişi/çocuk fiyatı ve
 * yüzde kampanyasıyla fiyatlanır; ardından kal-öde kampanyaları denenir.
 * Kal-öde yüzde kampanyalarla BİRLEŞTİRİLMEZ (otellerin genel kuralı):
 * kampanyasız gece fiyatları üzerinden hesaplanır ve misafir hangisi daha
 * ucuzsa onu öder.
 */
export function quoteStayNights(
  input: Omit<GuestRoomPricingInput, "date" | "nights">,
  dates: string[],
): StayNightsQuote {
  const count = dates.length;
  const resolved = dates.map((date) => resolveGuestRoomPrice({ ...input, date, nights: count }));
  const minStayNights = resolved.reduce((max, r) => Math.max(max, r.minStayNights ?? 0), input.room.minStayNights ?? 0);
  const unpricedIndex = resolved.findIndex((r) => r.priceOnRequest || r.priceMinor == null || r.priceMinor <= 0);
  const currencies = new Set(resolved.map((r) => r.currency));
  const base: StayNightsQuote = {
    nights: [],
    totalMinor: null,
    originalTotalMinor: null,
    currency: resolved[0]?.currency ?? input.room.currency,
    discountLabel: null,
    stayPromotion: null,
    minStayNights,
    unpricedDate: unpricedIndex >= 0 ? (dates[unpricedIndex] ?? null) : null,
    mixedCurrency: currencies.size > 1,
    firstNight: resolved[0] ?? null,
  };
  if (!count || unpricedIndex >= 0 || currencies.size > 1) return base;

  const nightly = resolved.map((r, i) => ({ date: dates[i] as string, priceMinor: r.priceMinor as number }));
  const percentTotal = nightly.reduce((sum, n) => sum + n.priceMinor, 0);
  const originalTotal = resolved.reduce((sum, r) => sum + (r.originalPriceMinor ?? (r.priceMinor as number)), 0);
  let best = {
    total: percentTotal,
    nights: nightly.map((n) => ({ ...n, free: false })),
    label: resolved.find((r) => r.discountLabel)?.discountLabel ?? null,
    stayPromotion: null as StayNightsQuote["stayPromotion"],
  };

  const bookingDate = input.bookingDate ?? todayIso();
  const stayPromos = (input.promotions ?? []).filter((p) => isStayPayActive(p, input.room.id, dates, bookingDate));
  if (stayPromos.length) {
    // Kampanyasız gece fiyatı (oda indirimi ve dönem fiyatı dahil).
    const plain = dates.map((date) => resolveGuestRoomPrice({ ...input, promotions: [], date, nights: count }));
    if (plain.every((r) => !r.priceOnRequest && r.priceMinor != null)) {
      const plainNights = plain.map((r, i) => ({ date: dates[i] as string, priceMinor: r.priceMinor as number }));
      for (const promo of stayPromos) {
        const tier = stayPayTierFor(promo.stayPayTiers ?? [], count) as StayPayTier;
        const freeCount = tier.stay - tier.pay;
        const free = pickFreeNights(plainNights, freeCount, promo.freeNightRule ?? "en_ucuz");
        const total = plainNights.reduce((sum, n, i) => sum + (free.has(i) ? 0 : n.priceMinor), 0);
        if (total < best.total) {
          best = {
            total,
            nights: plainNights.map((n, i) => ({ ...n, free: free.has(i) })),
            label: promo.name,
            stayPromotion: { name: promo.name, freeNights: freeCount },
          };
        }
      }
    }
  }

  const undiscounted = Math.max(originalTotal, best.stayPromotion ? best.nights.reduce((s, n) => s + n.priceMinor, 0) : 0);
  return {
    ...base,
    nights: best.nights,
    totalMinor: best.total,
    originalTotalMinor: undiscounted > best.total ? undiscounted : null,
    discountLabel: best.label,
    stayPromotion: best.stayPromotion,
  };
}

// ---------------------------------------------------------------------------
// İleri tarihli "başlayan" fiyat
// ---------------------------------------------------------------------------

export interface UpcomingGuestPrice {
  priceMinor: number;
  currency: string;
  /** Fiyatın ilk geçerli olduğu gece (YYYY-MM-DD). */
  fromDate: string;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Bugün fiyatı olmayan otel için en yakın ileri tarihli fiyat: "14 Kasım'dan
 * itibaren ₺7.500". Yalnız fiyat dönemi bugünden sonra başlayan otellerde
 * anlamlıdır; bugün fiyatlı otelde çağıran bugünkü fiyatı kullanır.
 *
 * Her dönemin ilk 7 gecesinde fiyat motoru çalıştırılır (yalnız belli
 * günlerde geçerli dönemler için); en erken fiyatlı gece ve o gecedeki en
 * düşük oda fiyatı döner. Dönemin en az gece koşulu varsa o süreyle bakılır.
 */
export function resolveUpcomingFromPrice(
  rooms: GuestRoomPricingInput[],
  today: string = todayIso(),
  horizonDays = 400,
): UpcomingGuestPrice | null {
  const tomorrow = addDaysIso(today, 1);
  const horizon = addDaysIso(today, horizonDays);
  const candidates: { date: string; room: GuestRoomPricingInput; nights: number }[] = [];

  for (const room of rooms) {
    const periods = [
      ...room.rates.map((r) => ({ startDate: r.startDate, endDate: r.endDate, min: r.stayMinNights ?? r.minStayNights })),
      ...(room.ratePlanPrices ?? [])
        .filter((p) => p.roomId === room.room.id)
        .map((p) => ({ startDate: p.startDate, endDate: p.endDate, min: p.minStayNights })),
    ];
    for (const period of periods) {
      if (period.endDate < tomorrow || period.startDate > horizon) continue;
      const start = period.startDate > tomorrow ? period.startDate : tomorrow;
      const nights = Math.max(1, period.min ?? 1, room.room.minStayNights ?? 1);
      for (let i = 0; i < 7; i++) {
        const date = addDaysIso(start, i);
        if (date > period.endDate) break;
        candidates.push({ date, room, nights });
      }
    }
  }

  candidates.sort((a, b) => a.date.localeCompare(b.date));
  let found: UpcomingGuestPrice | null = null;
  for (const c of candidates) {
    if (found && c.date > found.fromDate) break;
    const priced = resolveGuestRoomPrice({ ...c.room, date: c.date, nights: c.nights, bookingDate: today });
    if (priced.priceOnRequest || priced.priceMinor == null || priced.priceMinor <= 0) continue;
    if (!found || priced.priceMinor < found.priceMinor) {
      found = { priceMinor: priced.priceMinor, currency: priced.currency, fromDate: c.date };
    }
  }
  return found;
}

const MONTH_ABLATIVE: Record<number, string> = {
  1: "Ocak'tan", 2: "Şubat'tan", 3: "Mart'tan", 4: "Nisan'dan", 5: "Mayıs'tan", 6: "Haziran'dan",
  7: "Temmuz'dan", 8: "Ağustos'tan", 9: "Eylül'den", 10: "Ekim'den", 11: "Kasım'dan", 12: "Aralık'tan",
};

/** Yılın okunuşuna göre ayrılma eki: 2026'dan, 2027'den, 2030'dan. */
function yearAblative(year: number): string {
  const ones = ["", "den", "den", "ten", "ten", "ten", "dan", "den", "den", "dan"];
  const tens = ["", "dan", "den", "dan", "tan", "den", "tan", "ten", "den", "dan"];
  const suffix = year % 10 ? ones[year % 10] : year % 100 ? tens[(year % 100) / 10] : "den";
  return `${year}'${suffix}`;
}

/** "14 Kasım'dan itibaren" — yıl bugünkünden farklıysa "23 Ocak 2027'den itibaren". */
export function formatUpcomingFrom(iso: string, today: string = todayIso()): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const month = MONTH_ABLATIVE[m] as string;
  if (iso.slice(0, 4) === today.slice(0, 4)) return `${d} ${month} itibaren`;
  return `${d} ${month.split("'")[0]} ${yearAblative(y)} itibaren`;
}

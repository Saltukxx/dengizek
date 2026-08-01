// ---------------------------------------------------------------------------
// Misafir fiyat çözümleme — promotion > rate plan > seasonal > base+discount
// ---------------------------------------------------------------------------

import {
  applyDiscount,
  resolveCurrentRate,
  resolveRatePriceForGuests,
  todayIso,
  type ChildAgePriceLike,
  type OccupancyPriceLike,
  type RateLike,
  type ResolvedRate,
} from "@/lib/price";

export interface GuestPromotion {
  name: string;
  discountPercent: number;
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

function isPromotionActive(
  promo: GuestPromotion,
  roomId: string,
  date: string,
  nights: number,
): boolean {
  if (!promo.isActive) return false;
  if (promo.roomIds.length > 0 && !promo.roomIds.includes(roomId)) return false;
  if (promo.validFrom && date < promo.validFrom) return false;
  if (promo.validTo && date > promo.validTo) return false;
  if (promo.minNights != null && nights < promo.minNights) return false;
  return true;
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

  const seasonal = resolveCurrentRate(input.room, input.rates, date, input.guestCount);
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
): ChildAgePriceLike[] {
  const active = rates
    .filter((r) => r.startDate <= date && date <= r.endDate)
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  const winner = active[0];
  if (winner?.childAgePrices?.length) return winner.childAgePrices;
  return room.childAgePrices ?? [];
}

/** Yaşa göre gecelik çocuk fiyatı — eşleşme yoksa yetişkin fiyatından ücretlendirilir. */
function resolveChildNightlyPrice(
  age: number,
  bands: ChildAgePriceLike[],
  adultNightlyMinor: number,
): number {
  const band = bands.find((b) => age >= b.ageFrom && age <= b.ageTo);
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
  const bands = resolveActiveChildAgePrices(input.room, input.rates, date);
  const childBreakdown: GuestChildPriceLine[] = childAges.map((age) => ({
    age,
    priceMinor: resolveChildNightlyPrice(age, bands, base.priceMinor as number),
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
    .filter((p) => isPromotionActive(p, input.room.id, date, nights))
    .reduce<GuestPromotion | undefined>(
      (best, p) => (best == null || p.discountPercent > best.discountPercent ? p : best),
      undefined,
    );
  if (activePromo) {
    const underlying = resolveUnderlyingPrice(input, date);
    if (!underlying.priceOnRequest && underlying.priceMinor != null) {
      return {
        ...underlying,
        originalPriceMinor: underlying.priceMinor,
        priceMinor: applyDiscount(underlying.priceMinor, activePromo.discountPercent),
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

  const seasonal = resolveCurrentRate(input.room, input.rates, date, input.guestCount);
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

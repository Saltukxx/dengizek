// ---------------------------------------------------------------------------
// Misafir fiyat çözümleme — promotion > rate plan > seasonal > base+discount
// ---------------------------------------------------------------------------

import {
  applyDiscount,
  resolveCurrentRate,
  todayIso,
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
  };
  rates: RateLike[];
  promotions?: GuestPromotion[];
  ratePlanPrices?: GuestRatePlanPrice[];
  date?: string;
  nights?: number;
  guestCount?: number | null;
}

export type GuestPriceSource = "promotion" | "rate_plan" | "seasonal" | "base";

export interface GuestRoomPrice extends ResolvedRate {
  originalPriceMinor: number | null;
  discountPercent: number | null;
  discountLabel: string | null;
  source: GuestPriceSource;
  promotionName?: string;
  hasCampaign: boolean;
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
): ResolvedRate | null {
  const active = prices
    .filter((p) => p.roomId === roomId && p.startDate <= date && date <= p.endDate)
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  const winner = active[0];
  if (!winner) return null;
  return {
    priceMinor: winner.priceMinor,
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

/** Aktif kampanya, fiyat planı, dönem veya baz fiyattan misafir fiyatını çözer. */
export function resolveGuestRoomPrice(input: GuestRoomPricingInput): GuestRoomPrice {
  const date = input.date ?? todayIso();
  const nights = input.nights ?? 1;
  const promotions = input.promotions ?? [];

  const activePromo = promotions.find((p) => isPromotionActive(p, input.room.id, date, nights));
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

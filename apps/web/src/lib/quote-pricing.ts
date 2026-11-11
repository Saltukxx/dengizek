// ---------------------------------------------------------------------------
// Konaklama fiyat hesabının girdisi (QuotePricing). Web otel sayfasındaki
// hesaplayıcı ve iOS'un /api/v1/hotels/{slug}/quote ucu aynı veriden, aynı
// quoteStay hesabıyla fiyat verir.
// ---------------------------------------------------------------------------

import { getHotelIdBySlug, type PublishedHotelContent } from "@/lib/hotels-repo";
import { todayIso } from "@/lib/price";
import type { QuotePricing } from "@/lib/stay-search";

/** Envanter ufku (≈ 18 ay) — kısıtlar bu aralıkta okunur. */
const RESTRICTION_HORIZON_DAYS = 548;

/** Stop sale / dolu / CTA-CTD kısıtları — okunamazsa hesap kısıtsız çalışır. */
async function loadGuestRestrictions(hotelId: string | null) {
  if (!hotelId) return {};
  try {
    const { loadStayRestrictions } = await import("@/lib/stay-restrictions");
    const today = todayIso();
    const horizon = new Date(`${today}T12:00:00.000Z`);
    horizon.setUTCDate(horizon.getUTCDate() + RESTRICTION_HORIZON_DAYS);
    return await loadStayRestrictions(hotelId, today, horizon.toISOString().slice(0, 10));
  } catch {
    return {};
  }
}

export async function loadQuotePricing(slug: string, content: PublishedHotelContent): Promise<QuotePricing> {
  return {
    rooms: content.rooms.map((room) => ({
      id: room.id,
      slug: room.slug,
      name: room.name,
      imageUrl: room.imageUrl ?? null,
      boardType: room.boardType ?? null,
      capacityAdults: room.capacityAdults ?? null,
      capacityChildren: room.capacityChildren ?? null,
      priceMinor: room.priceMinor ?? null,
      currency: room.currency,
      priceOnRequest: room.priceOnRequest,
      discountPercent: room.discountPercent ?? null,
      discountLabel: room.discountLabel ?? null,
      minStayNights: room.minStayNights ?? null,
      childAgePrices: room.childAgePrices ?? null,
      rates: room.rates.map((rate) => ({
        name: rate.name,
        startDate: String(rate.startDate),
        endDate: String(rate.endDate),
        priceMinor: rate.priceMinor,
        currency: rate.currency,
        minStayNights: rate.minStayNights,
        occupancyPrices: rate.occupancyPrices ?? undefined,
        childAgePrices: rate.childAgePrices ?? undefined,
        weekdays: rate.weekdays ?? null,
        stayMinNights: rate.stayMinNights ?? null,
        stayMaxNights: rate.stayMaxNights ?? null,
      })),
    })),
    promotions: content.promotions,
    ratePlanPrices: content.ratePlanPrices,
    closedRanges: content.availabilityNotes
      .filter((note) => note.isBlackout && note.startDate)
      .map((note) => ({ startDate: note.startDate, endDate: note.endDate })),
    restrictions: await loadGuestRestrictions(await getHotelIdBySlug(slug)),
  };
}

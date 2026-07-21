// ---------------------------------------------------------------------------
// AI fiyat motoru — tüm fiyatlar DB/kod yolundan; LLM rakam üretmez
// ---------------------------------------------------------------------------

import { resolveGuestRoomPrice, type GuestRoomPricingInput } from "@/lib/guest-pricing";
import { getPublishedHotelContent } from "@/lib/hotels-repo";
import { formatDateRangeTr, formatPrice, type RateLike } from "@/lib/price";
import { eachStayNight, validateStayDates } from "@/lib/stay-dates";
import type { AiPriceCard, AiPriceQueryResult } from "@/lib/ai/types";
import { boardTypeLabels } from "@/lib/schemas/hotel-content";

export interface RoomPriceQuery {
  roomSlug?: string;
  checkIn?: string;
  checkOut?: string;
  guestCount?: number;
  childAges?: number[];
}

function mapRates(rates: {
  name: string;
  startDate: string;
  endDate: string;
  priceMinor: number;
  currency: string;
  minStayNights?: number | null;
  occupancyPrices?: { guestCount: number; priceMinor: number }[] | null;
  childAgePrices?: RateLike["childAgePrices"] | null;
}[]): RateLike[] {
  return rates.map((r) => ({
    name: r.name,
    startDate: String(r.startDate),
    endDate: String(r.endDate),
    priceMinor: r.priceMinor,
    currency: r.currency,
    minStayNights: r.minStayNights,
    occupancyPrices: r.occupancyPrices ?? undefined,
    childAgePrices: r.childAgePrices ?? undefined,
  }));
}

function buildPricingInput(
  content: Awaited<ReturnType<typeof getPublishedHotelContent>>,
  room: (typeof content.rooms)[number],
  guestCount?: number,
  childAges?: number[],
): GuestRoomPricingInput {
  return {
    room: {
      id: room.id,
      priceMinor: room.priceMinor,
      currency: room.currency,
      priceOnRequest: room.priceOnRequest,
      discountPercent: room.discountPercent,
      discountLabel: room.discountLabel,
      minStayNights: room.minStayNights,
      childAgePrices: room.childAgePrices ?? undefined,
    },
    rates: mapRates(room.rates),
    promotions: content.promotions,
    ratePlanPrices: content.ratePlanPrices,
    guestCount,
    childAges,
  };
}

function formatGuestPrice(price: ReturnType<typeof resolveGuestRoomPrice>): string {
  if (price.priceOnRequest || price.priceMinor == null) return "Talep üzerine";
  if (price.originalPriceMinor != null && price.discountPercent) {
    return `${formatPrice(price.priceMinor, price.currency, false)} (indirimli; normal ${formatPrice(price.originalPriceMinor, price.currency, false)})`;
  }
  return formatPrice(price.priceMinor, price.currency, false);
}

function formatChildBreakdownLine(price: ReturnType<typeof resolveGuestRoomPrice>): string | null {
  if (!price.childBreakdown?.length) return null;
  return price.childBreakdown
    .map((c) => `${c.age} yaş: ${formatPrice(c.priceMinor, price.currency, false)}`)
    .join(" · ");
}

function buildSingleNightCard(
  room: Awaited<ReturnType<typeof getPublishedHotelContent>>["rooms"][number],
  content: Awaited<ReturnType<typeof getPublishedHotelContent>>,
  guestCount?: number,
  dateLabel = "Bugün (gecelik)",
  childAges?: number[],
): AiPriceCard {
  const base = buildPricingInput(content, room, guestCount, childAges);
  const resolved = resolveGuestRoomPrice({ ...base, nights: 1 });

  const lines: AiPriceCard["lines"] = [{ label: dateLabel, value: formatGuestPrice(resolved) }];

  if (guestCount) {
    lines.unshift({ label: "Kişi sayısı", value: String(guestCount) });
  }
  const childLine = formatChildBreakdownLine(resolved);
  if (childLine) {
    lines.push({ label: "Çocuk fiyatları", value: childLine });
  }
  if (resolved.rateName) {
    lines.push({ label: "Dönem", value: resolved.rateName });
  }
  if (resolved.minStayNights) {
    lines.push({ label: "Min. konaklama", value: `${resolved.minStayNights} gece` });
  }
  if (room.boardType && room.boardType !== "sadece-oda") {
    lines.push({
      label: "Pansiyon",
      value: boardTypeLabels[room.boardType as keyof typeof boardTypeLabels] ?? room.boardType,
    });
  }

  return {
    roomName: room.name,
    roomSlug: room.slug,
    lines,
    priceOnRequest: resolved.priceOnRequest || resolved.priceMinor == null,
  };
}

function buildStayTotalCard(
  room: Awaited<ReturnType<typeof getPublishedHotelContent>>["rooms"][number],
  content: Awaited<ReturnType<typeof getPublishedHotelContent>>,
  checkIn: string,
  checkOut: string,
  guestCount?: number,
  childAges?: number[],
): AiPriceCard {
  const nights = eachStayNight(checkIn, checkOut);
  const base = buildPricingInput(content, room, guestCount, childAges);

  let totalMinor = 0;
  let currency = room.currency;
  let priceOnRequest = false;
  const nightly: string[] = [];
  let firstNightChildLine: string | null = null;

  for (const date of nights) {
    const resolved = resolveGuestRoomPrice({
      ...base,
      date,
      nights: nights.length,
      guestCount,
    });
    if (resolved.priceOnRequest || resolved.priceMinor == null) {
      priceOnRequest = true;
      break;
    }
    totalMinor += resolved.priceMinor;
    currency = resolved.currency;
    nightly.push(`${date}: ${formatGuestPrice(resolved)}`);
    if (!firstNightChildLine) firstNightChildLine = formatChildBreakdownLine(resolved);
  }

  const lines: AiPriceCard["lines"] = [
    { label: "Tarihler", value: formatDateRangeTr(checkIn, checkOut) },
    { label: "Gece sayısı", value: String(nights.length) },
  ];

  if (guestCount) {
    lines.push({ label: "Kişi sayısı", value: String(guestCount) });
  }
  if (firstNightChildLine) {
    lines.push({ label: "Çocuk fiyatları (gecelik)", value: firstNightChildLine });
  }

  if (priceOnRequest) {
    lines.push({ label: "Konaklama toplamı", value: "Talep üzerine" });
  } else {
    lines.push({
      label: "Konaklama toplamı",
      value: formatPrice(totalMinor, currency, false),
    });
    if (nights.length <= 7) {
      lines.push({ label: "Gecelik döküm", value: nightly.join(" · ") });
    }
  }

  if (room.minStayNights && nights.length < room.minStayNights) {
    lines.push({
      label: "Not",
      value: `Bu oda için minimum ${room.minStayNights} gece konaklama gerekebilir.`,
    });
  }

  return {
    roomName: room.name,
    roomSlug: room.slug,
    lines,
    priceOnRequest,
  };
}

/** Otel oda fiyatlarını sorgular — bugün, tarih aralığı veya kişi sayısı. */
export async function queryRoomPrices(
  hotelSlug: string,
  query: RoomPriceQuery,
): Promise<AiPriceQueryResult> {
  const content = await getPublishedHotelContent(hotelSlug);
  if (content.rooms.length === 0) {
    return { ok: false, cards: [], error: "Yayında oda bulunamadı." };
  }

  let rooms = content.rooms;
  if (query.roomSlug) {
    rooms = rooms.filter((r) => r.slug === query.roomSlug);
    if (rooms.length === 0) {
      return { ok: false, cards: [], error: "Belirtilen oda bulunamadı." };
    }
  }

  const guestCount = query.guestCount;
  const childAges = query.childAges;

  if (query.checkIn || query.checkOut) {
    const validated = validateStayDates(query.checkIn, query.checkOut);
    if (!validated.ok) {
      return { ok: false, cards: [], error: validated.error };
    }
    if (validated.checkIn && validated.checkOut) {
      const cards = rooms.map((room) =>
        buildStayTotalCard(room, content, validated.checkIn!, validated.checkOut!, guestCount, childAges),
      );
      return { ok: true, cards };
    }
  }

  const cards = rooms.map((room) => buildSingleNightCard(room, content, guestCount, undefined, childAges));
  return { ok: true, cards };
}

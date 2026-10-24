// ---------------------------------------------------------------------------
// AI fiyat motoru — tüm fiyatlar DB/kod yolundan; LLM rakam üretmez.
//
// Doğruluk kuralları:
// - Geçmiş, 18 aydan uzak ya da 30 geceden uzun konaklama fiyatlanmaz
//   (hatalı tarih çıkarımı ya da yayınlanmamış sezon fiyatı riski).
// - Her gece kendi dönemi/kampanyasıyla ayrı fiyatlanır; minimum konaklama
//   gece bazında (dönem kuralı dahil) denetlenir.
// - Para birimi geceler arasında değişirse toplam ALINMAZ.
// - Kapasiteyi aşan kişi sayısı ve yaşı bilinmeyen çocuklar kartta açıkça yazılır.
// ---------------------------------------------------------------------------

import { resolveGuestRoomPrice, type GuestRoomPricingInput } from "@/lib/guest-pricing";
import { getPublishedHotelContent } from "@/lib/hotels-repo";
import { formatDateRangeTr, formatPrice, todayIso, type RateLike } from "@/lib/price";
import { eachStayNight, validateStayDates } from "@/lib/stay-dates";
import type { AiPriceCard, AiPriceQueryResult, AiPriceErrorCode } from "@/lib/ai/types";
import { boardTypeLabels } from "@/lib/schemas/hotel-content";
import { addDays } from "@/lib/ai/stay-query";

export interface RoomPriceQuery {
  roomSlug?: string;
  checkIn?: string;
  checkOut?: string;
  /** Gün verilmeden sorulan ay (YYYY-MM): o ayın gecelik fiyat aralığı. */
  month?: string;
  /** Yetişkin (ya da yaşı belirtilmemiş kişi) sayısı. */
  guestCount?: number;
  childAges?: number[];
  /** Çocuk sayısı — yaşı bilinmeyenler fiyata eklenmez, kartta not düşülür. */
  childCount?: number;
}

/** Bir konaklamada fiyatlanabilecek en fazla gece. */
export const MAX_STAY_NIGHTS = 30;
/** Bugünden en fazla bu kadar gün ilerisi fiyatlanır (envanter ufku ≈ 18 ay). */
export const MAX_HORIZON_DAYS = 548;

const MONTH_NAMES_TR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

type Content = Awaited<ReturnType<typeof getPublishedHotelContent>>;
type Room = Content["rooms"][number];
type Resolved = ReturnType<typeof resolveGuestRoomPrice>;

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
  content: Content,
  room: Room,
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

function isUnpriced(price: Resolved): boolean {
  return price.priceOnRequest || price.priceMinor == null;
}

function formatGuestPrice(price: Resolved): string {
  if (isUnpriced(price)) return "Talep üzerine";
  if (price.originalPriceMinor != null && price.discountPercent) {
    return `${formatPrice(price.priceMinor, price.currency, false)} (indirimli; normal ${formatPrice(price.originalPriceMinor, price.currency, false)})`;
  }
  return formatPrice(price.priceMinor, price.currency, false);
}

function formatChildBreakdownLine(price: Resolved): string | null {
  if (!price.childBreakdown?.length) return null;
  return price.childBreakdown
    .map((c) => `${c.age} yaş: ${formatPrice(c.priceMinor, price.currency, false)}`)
    .join(" · ");
}

function shortDateTr(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTH_NAMES_TR[(m ?? 1) - 1]}`;
}

/** Kartın ortak notları: kişi/çocuk, kapasite, pansiyon. */
function commonLines(room: Room, query: RoomPriceQuery): AiPriceCard["lines"] {
  const lines: AiPriceCard["lines"] = [];
  const adults = room.capacityAdults ?? null;
  const children = room.capacityChildren ?? null;
  if (query.guestCount && adults != null && query.guestCount > adults) {
    lines.push({
      label: "Kapasite",
      value: `Bu oda en fazla ${adults} yetişkin içindir; ${query.guestCount} kişi için otelden teyit gerekir.`,
    });
  }
  const childCount = query.childCount ?? query.childAges?.length ?? 0;
  if (childCount && children != null && childCount > children) {
    lines.push({
      label: "Kapasite",
      value: `Bu odada en fazla ${children} çocuk konaklayabilir; otelden teyit gerekir.`,
    });
  }
  const missingAges = childCount - (query.childAges?.length ?? 0);
  if (missingAges > 0) {
    lines.push({
      label: "Çocuklar",
      value: `${missingAges} çocuğun yaşı belirtilmedi; çocuk ücreti fiyata eklenmedi. Yaşlarını yazarsanız eklenir.`,
    });
  }
  if (room.boardType && room.boardType !== "sadece-oda") {
    lines.push({
      label: "Pansiyon",
      value: boardTypeLabels[room.boardType as keyof typeof boardTypeLabels] ?? room.boardType,
    });
  }
  return lines;
}

function guestLine(query: RoomPriceQuery): AiPriceCard["lines"] {
  return query.guestCount ? [{ label: "Kişi sayısı", value: String(query.guestCount) }] : [];
}

function buildSingleNightCard(room: Room, content: Content, query: RoomPriceQuery, today: string): AiPriceCard {
  const base = buildPricingInput(content, room, query.guestCount, query.childAges);
  const resolved = resolveGuestRoomPrice({ ...base, date: today, nights: 1 });

  const lines: AiPriceCard["lines"] = [
    ...guestLine(query),
    { label: "Bugün (gecelik)", value: formatGuestPrice(resolved) },
  ];
  const childLine = formatChildBreakdownLine(resolved);
  if (childLine) lines.push({ label: "Çocuk fiyatları", value: childLine });
  if (resolved.rateName) lines.push({ label: "Dönem", value: resolved.rateName });
  if (resolved.minStayNights) lines.push({ label: "Min. konaklama", value: `${resolved.minStayNights} gece` });
  lines.push(...commonLines(room, query));

  return { roomName: room.name, roomSlug: room.slug, lines, priceOnRequest: isUnpriced(resolved) };
}

/**
 * Verilen tarihler satışa açık mı? Fiyat gizlenmez — kotasyon doğru ama
 * müsaitlik teyidi gerektiğini söylemek yanlış beklenti oluşmasını engeller.
 * DB yoksa/hata varsa sessizce "not yok" döner; fiyat akışını asla kırmaz.
 */
async function availabilityNote(roomId: string, checkIn: string, checkOut: string): Promise<string | null> {
  try {
    const { getDb, isDbConfigured } = await import("@/lib/db");
    if (!isDbConfigured()) return null;
    const { assertInventoryAvailable } = await import("@/lib/bookings");
    const result = await assertInventoryAvailable(getDb(), roomId, checkIn, checkOut);
    return result.ok ? null : result.error;
  } catch {
    return null;
  }
}

function buildStayTotalCard(
  room: Room,
  content: Content,
  checkIn: string,
  checkOut: string,
  query: RoomPriceQuery,
): AiPriceCard {
  const nights = eachStayNight(checkIn, checkOut);
  const base = buildPricingInput(content, room, query.guestCount, query.childAges);

  let totalMinor = 0;
  const currencies = new Set<string>();
  let unpricedNight: string | null = null;
  let minStay = room.minStayNights ?? 0;
  const nightly: string[] = [];
  let firstNightChildLine: string | null = null;

  for (const date of nights) {
    const resolved = resolveGuestRoomPrice({ ...base, date, nights: nights.length });
    minStay = Math.max(minStay, resolved.minStayNights ?? 0);
    if (isUnpriced(resolved)) {
      unpricedNight ??= date;
      continue;
    }
    totalMinor += resolved.priceMinor as number;
    currencies.add(resolved.currency);
    nightly.push(`${shortDateTr(date)}: ${formatGuestPrice(resolved)}`);
    firstNightChildLine ??= formatChildBreakdownLine(resolved);
  }

  const lines: AiPriceCard["lines"] = [
    { label: "Tarihler", value: formatDateRangeTr(checkIn, checkOut) },
    { label: "Gece sayısı", value: String(nights.length) },
    ...guestLine(query),
  ];
  if (firstNightChildLine) lines.push({ label: "Çocuk fiyatları (gecelik)", value: firstNightChildLine });

  let priceOnRequest = false;
  if (unpricedNight) {
    priceOnRequest = true;
    lines.push({ label: "Konaklama toplamı", value: "Talep üzerine" });
    if (nightly.length) {
      lines.push({ label: "Not", value: `${shortDateTr(unpricedNight)} gecesinin fiyatı otelden teyit edilmeli.` });
    }
  } else if (currencies.size > 1) {
    // Farklı para birimleri toplanamaz.
    priceOnRequest = true;
    lines.push({ label: "Konaklama toplamı", value: "Talep üzerine" });
    lines.push({ label: "Not", value: "Bu tarihlerde geceler farklı para birimlerinde fiyatlanıyor; toplam otelden teyit edilmeli." });
  } else {
    const [currency] = [...currencies];
    lines.push({ label: "Konaklama toplamı", value: formatPrice(totalMinor, currency ?? room.currency, false) });
  }
  if (nightly.length && nights.length <= 7) {
    lines.push({ label: "Gecelik döküm", value: nightly.join(" · ") });
  }

  if (minStay && nights.length < minStay) {
    lines.push({
      label: "Min. konaklama",
      value: `Bu tarihlerde en az ${minStay} gece konaklama gerekiyor; ${nights.length} gecelik rezervasyon kabul edilmeyebilir.`,
    });
  }
  lines.push(...commonLines(room, query));

  return { roomName: room.name, roomSlug: room.slug, lines, priceOnRequest };
}

/** Ayın (bugünden itibaren) gecelik fiyat aralığı. */
function buildMonthCard(room: Room, content: Content, from: string, to: string, query: RoomPriceQuery): AiPriceCard {
  const base = buildPricingInput(content, room, query.guestCount, query.childAges);
  const prices: number[] = [];
  const currencies = new Set<string>();
  let unpriced = 0;
  let minStay = room.minStayNights ?? 0;
  const rateNames = new Set<string>();

  for (const date of eachStayNight(from, addDays(to, 1))) {
    const resolved = resolveGuestRoomPrice({ ...base, date, nights: 1 });
    minStay = Math.max(minStay, resolved.minStayNights ?? 0);
    if (isUnpriced(resolved)) {
      unpriced += 1;
      continue;
    }
    prices.push(resolved.priceMinor as number);
    currencies.add(resolved.currency);
    if (resolved.rateName) rateNames.add(resolved.rateName);
  }

  const [year, month] = from.split("-").map(Number);
  const lines: AiPriceCard["lines"] = [
    { label: "Dönem", value: `${MONTH_NAMES_TR[(month ?? 1) - 1]} ${year} (${shortDateTr(from)} – ${shortDateTr(to)})` },
    ...guestLine(query),
  ];

  let priceOnRequest = false;
  if (!prices.length || currencies.size > 1) {
    priceOnRequest = true;
    lines.push({ label: "Gecelik fiyat", value: "Talep üzerine" });
  } else {
    const [currency] = [...currencies];
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    lines.push({
      label: "Gecelik fiyat",
      value: min === max
        ? formatPrice(min, currency, false)
        : `${formatPrice(min, currency, false)} – ${formatPrice(max, currency, false)} (geceye göre değişir)`,
    });
    if (unpriced) lines.push({ label: "Not", value: `${unpriced} gecenin fiyatı talep üzerine.` });
  }
  if (rateNames.size) lines.push({ label: "Fiyat dönemleri", value: [...rateNames].join(", ") });
  if (minStay > 1) lines.push({ label: "Min. konaklama", value: `${minStay} geceye kadar` });
  lines.push(...commonLines(room, query));

  return { roomName: room.name, roomSlug: room.slug, lines, priceOnRequest };
}

function fail(errorCode: AiPriceErrorCode, error: string, query: RoomPriceQuery): AiPriceQueryResult {
  return { ok: false, cards: [], error, errorCode, query };
}

/** Konaklama aralığı için tarih kuralları (geçmiş, ufuk, süre). */
function checkStayWindow(checkIn: string, checkOut: string, today: string, query: RoomPriceQuery): AiPriceQueryResult | null {
  if (checkIn < today) {
    const [y] = checkIn.split("-");
    return fail("past_date", `Giriş tarihi (${shortDateTr(checkIn)} ${y}) geçmişte kalıyor.`, query);
  }
  if (checkIn > addDays(today, MAX_HORIZON_DAYS)) {
    return fail("too_far", "Bu tarih için otel henüz fiyat açıklamamış olabilir; otelden teyit almanız gerekir.", query);
  }
  if (eachStayNight(checkIn, checkOut).length > MAX_STAY_NIGHTS) {
    return fail("too_long", `${MAX_STAY_NIGHTS} geceden uzun konaklamalar için fiyatı otel özel olarak belirliyor.`, query);
  }
  return null;
}

/** Otel oda fiyatlarını sorgular — bugün, tarih aralığı, ay veya kişi sayısı. */
export async function queryRoomPrices(
  hotelSlug: string,
  query: RoomPriceQuery,
  today: string = todayIso(),
): Promise<AiPriceQueryResult> {
  const content = await getPublishedHotelContent(hotelSlug);
  if (content.rooms.length === 0) {
    return fail("no_rooms", "Yayında oda bulunamadı.", query);
  }

  let rooms = content.rooms;
  if (query.roomSlug) {
    rooms = rooms.filter((r) => r.slug === query.roomSlug);
    if (rooms.length === 0) return fail("room_not_found", "Belirtilen oda bulunamadı.", query);
  } else if (query.guestCount) {
    // Oda belirtilmediyse kişi sayısını alamayan odalar listelenmez; hiçbiri
    // alamıyorsa hepsi kapasite notuyla gösterilir.
    const fitting = rooms.filter((r) => r.capacityAdults == null || r.capacityAdults >= query.guestCount!);
    if (fitting.length) rooms = fitting;
  }

  if (query.checkIn || query.checkOut) {
    const validated = validateStayDates(query.checkIn, query.checkOut);
    if (!validated.ok) return fail("invalid_dates", validated.error, query);
    const checkIn = validated.checkIn!;
    const checkOut = validated.checkOut!;
    const blocked = checkStayWindow(checkIn, checkOut, today, query);
    if (blocked) return blocked;
    const cards = await Promise.all(
      rooms.map(async (room) => {
        const card = buildStayTotalCard(room, content, checkIn, checkOut, query);
        const note = await availabilityNote(room.id, checkIn, checkOut);
        if (note) card.lines.push({ label: "Müsaitlik", value: `${note} Bu tarihler için teyit gerekiyor.` });
        return card;
      }),
    );
    return { ok: true, cards, query };
  }

  if (query.month) {
    const match = /^(\d{4})-(\d{2})$/.exec(query.month);
    const year = Number(match?.[1]);
    const month = Number(match?.[2]);
    if (!match || month < 1 || month > 12) return fail("invalid_dates", "Geçersiz ay.", query);
    const first = `${query.month}-01`;
    const last = addDays(month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`, -1);
    if (last < today) return fail("past_date", "Bu ay geçmişte kalıyor.", query);
    const from = first < today ? today : first;
    if (from > addDays(today, MAX_HORIZON_DAYS)) {
      return fail("too_far", "Bu tarih için otel henüz fiyat açıklamamış olabilir; otelden teyit almanız gerekir.", query);
    }
    return { ok: true, cards: rooms.map((room) => buildMonthCard(room, content, from, last, query)), query };
  }

  return { ok: true, cards: rooms.map((room) => buildSingleNightCard(room, content, query, today)), query };
}

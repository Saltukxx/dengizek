// ---------------------------------------------------------------------------
// Konaklama araması — tarih + kişi bilgisi URL'de taşınır, otel listesi bu
// bilgiye göre süzülür, otel sayfasındaki fiyat hesaplayıcı aynı bilgiyle
// açılır, talep formu da ondan doldurulur.
//
// URL anahtarları: giris, cikis (YYYY-AA-GG), yetiskin (1–12), cocuk (yaşlar,
// virgülle: "4,9"). İstemci ve sunucuda aynı kod çalışır (DB'ye dokunmaz).
// ---------------------------------------------------------------------------

import { quoteStayNights, type GuestPromotion, type GuestRatePlanPrice } from "@/lib/guest-pricing";
import type { ChildAgePriceLike, RateLike } from "@/lib/price";
import { eachStayNight, parseStayDate, stayRangesOverlap } from "@/lib/stay-dates";

export const MAX_ADULTS = 12;
export const MAX_CHILDREN = 6;
export const MAX_CHILD_AGE = 17;
/** Fiyat hesaplayıcının kabul ettiği en uzun konaklama. */
export const MAX_QUOTE_NIGHTS = 30;

export interface StayParty {
  adults: number;
  childAges: number[];
}

export interface StaySearch extends StayParty {
  /** İkisi birlikte geçerliyse dolu; aksi halde ikisi de null. */
  checkIn: string | null;
  checkOut: string | null;
  /** URL'de kişi bilgisi açıkça verildi mi? (varsayılan 2 yetişkin değil) */
  hasParty: boolean;
}

type ParamValue = string | string[] | undefined | null;
type ParamSource = Record<string, ParamValue> | URLSearchParams;

function read(source: ParamSource, key: string): string {
  const raw = source instanceof URLSearchParams ? source.get(key) : source[key];
  return (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
}

function clampInt(value: string, min: number, max: number): number | null {
  if (!/^\d{1,3}$/.test(value)) return null;
  return Math.min(max, Math.max(min, Number(value)));
}

/** URL parametrelerinden konaklama aramasını okur; bozuk değerler yok sayılır. */
export function parseStaySearch(source: ParamSource): StaySearch {
  const giris = read(source, "giris");
  const cikis = read(source, "cikis");
  const inDate = parseStayDate(giris);
  const outDate = parseStayDate(cikis);
  const datesOk = Boolean(inDate && outDate && outDate > inDate);

  const adultsRaw = read(source, "yetiskin");
  const childRaw = read(source, "cocuk");
  const adults = clampInt(adultsRaw, 1, MAX_ADULTS);
  const childAges = childRaw
    ? childRaw
        .split(",")
        .map((age) => clampInt(age.trim(), 0, MAX_CHILD_AGE))
        .filter((age): age is number => age != null)
        .slice(0, MAX_CHILDREN)
    : [];

  return {
    checkIn: datesOk ? giris : null,
    checkOut: datesOk ? cikis : null,
    adults: adults ?? 2,
    childAges,
    hasParty: adults != null || childAges.length > 0,
  };
}

/** Arama dolu mu? (tarih ya da kişi bilgisi verildiyse) */
export function hasStaySearch(stay: StaySearch): boolean {
  return Boolean(stay.checkIn) || stay.hasParty;
}

/** Konaklama aramasını URL parametrelerine yazar (boş alanlar atlanır). */
export function stayQueryEntries(stay: Partial<StaySearch>): [string, string][] {
  const entries: [string, string][] = [];
  if (stay.checkIn && stay.checkOut) {
    entries.push(["giris", stay.checkIn], ["cikis", stay.checkOut]);
  }
  if (stay.hasParty !== false && stay.adults) entries.push(["yetiskin", String(stay.adults)]);
  if (stay.childAges?.length) entries.push(["cocuk", stay.childAges.join(",")]);
  return entries;
}

/** Bir yola konaklama parametrelerini ekler: "/termal/oteller/x?giris=…". */
export function withStayQuery(href: string, stay: StaySearch | null | undefined): string {
  if (!stay || !hasStaySearch(stay)) return href;
  const [path, existing = ""] = href.split("?");
  const params = new URLSearchParams(existing);
  for (const [key, value] of stayQueryEntries(stay)) params.set(key, value);
  return `${path}?${params.toString()}`;
}

/** "12–15 Kas · 3 gece · 2 yetişkin, 1 çocuk" */
export function describeStay(stay: StaySearch): string {
  const parts: string[] = [];
  if (stay.checkIn && stay.checkOut) {
    const fmt = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" });
    const nights = eachStayNight(stay.checkIn, stay.checkOut).length;
    parts.push(`${fmt.format(parseStayDate(stay.checkIn)!)} – ${fmt.format(parseStayDate(stay.checkOut)!)}`, `${nights} gece`);
  }
  if (stay.hasParty) parts.push(describeParty(stay));
  return parts.join(" · ");
}

export function describeParty(party: StayParty): string {
  const children = party.childAges.length;
  return children ? `${party.adults} yetişkin, ${children} çocuk` : `${party.adults} yetişkin`;
}

// ── Kapasite ve müsaitlik ───────────────────────────────────────────────────

export interface RoomCapacity {
  capacityAdults: number | null;
  capacityChildren: number | null;
}

export type CapacityFit = "fits" | "confirm" | "no";

/**
 * Oda bu kişi sayısını alır mı?
 * - Yetişkin kapasitesi aşılırsa "no".
 * - Çocuk kapasitesi belirtilmemişse (0 ya da boş — aktarılan tesislerde
 *   çocuk kapasitesi çoğunlukla girilmemiş) "confirm": otelden teyit.
 */
export function roomCapacityFit(room: RoomCapacity, party: StayParty): CapacityFit {
  if (room.capacityAdults != null && room.capacityAdults > 0 && party.adults > room.capacityAdults) return "no";
  const children = party.childAges.length;
  if (!children) return "fits";
  if (room.capacityChildren == null || room.capacityChildren === 0) return "confirm";
  return children <= room.capacityChildren ? "fits" : "no";
}

export interface DateRange {
  startDate: string | null;
  endDate: string | null;
}

/** Konaklama otelin kapalı dönemlerinden biriyle çakışıyor mu? */
export function overlapsClosedRange(checkIn: string, checkOut: string, closed: DateRange[]): boolean {
  return closed.some((range) => {
    if (!range.startDate) return false;
    // Bitişi boş kapalı dönem tek günlüktür; çıkış günü dahil edilmez.
    const end = range.endDate ?? range.startDate;
    const endExclusive = new Date(`${end}T12:00:00.000Z`);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    return stayRangesOverlap(checkIn, checkOut, range.startDate, endExclusive.toISOString().slice(0, 10));
  });
}

// ── Fiyat hesabı ────────────────────────────────────────────────────────────

export interface QuoteRoom extends RoomCapacity {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  boardType: string | null;
  priceMinor: number | null;
  currency: string;
  priceOnRequest: boolean;
  discountPercent: number | null;
  discountLabel: string | null;
  minStayNights: number | null;
  childAgePrices?: ChildAgePriceLike[] | null;
  rates: RateLike[];
}

/** Envanterden gelen gece kısıtı (bkz. stay-restrictions). */
export interface NightRestriction {
  stopSell?: boolean;
  full?: boolean;
  cta?: boolean;
  ctd?: boolean;
  minStay?: number;
}

/** Oda kimliği → tarih → kısıt. Yalnız kısıtlı geceler bulunur. */
export type StayRestrictions = Record<string, Record<string, NightRestriction>>;

export interface QuotePricing {
  rooms: QuoteRoom[];
  promotions: GuestPromotion[];
  ratePlanPrices: GuestRatePlanPrice[];
  /** Otelin satışa kapalı dönemleri (müsaitlik notlarındaki kapalı dönem). */
  closedRanges?: DateRange[];
  /** Oda-gece satış kısıtları (stop sale, dolu, CTA/CTD, min. konaklama). */
  restrictions?: StayRestrictions;
}

/** Odanın bu konaklamada satılamama nedeni; satılabiliyorsa null. */
export function roomRestriction(
  restrictions: Record<string, NightRestriction> | undefined,
  checkIn: string,
  checkOut: string,
  nights: string[],
): { reason: string | null; minStay: number } {
  let minStay = 0;
  if (!restrictions) return { reason: null, minStay };
  for (const night of nights) {
    const r = restrictions[night];
    if (!r) continue;
    if (r.stopSell) return { reason: "Bu tarihlerde satışa kapalı", minStay };
    if (r.full) return { reason: "Bu tarihlerde müsait oda yok", minStay };
    if (r.minStay) minStay = Math.max(minStay, r.minStay);
  }
  if (restrictions[checkIn]?.cta) return { reason: "Giriş günü bu oda için girişe kapalı", minStay };
  if (restrictions[checkOut]?.ctd) return { reason: "Çıkış günü bu oda için çıkışa kapalı", minStay };
  return { reason: null, minStay };
}

export interface RoomQuote {
  slug: string;
  name: string;
  imageUrl: string | null;
  boardType: string | null;
  fit: CapacityFit;
  /** Toplam (tüm geceler, çocuk ücretleri dahil); fiyatlanamazsa null. */
  totalMinor: number | null;
  /** İndirimsiz toplam — indirim yoksa null. */
  originalTotalMinor: number | null;
  currency: string;
  discountLabel: string | null;
  /** Kal-öde kampanyasıyla ücretsiz olan gece sayısı (yoksa 0). */
  freeNights: number;
  /** Satış kısıtı varsa nedeni (stop sale, dolu, girişe/çıkışa kapalı). */
  unavailable: string | null;
  /** Bu tarihler için gereken en az gece (konaklama bunun altındaysa dolu). */
  minStayShortfall: number | null;
}

export type StayQuote =
  | { ok: true; nights: number; rooms: RoomQuote[] }
  | { ok: false; error: string };

/**
 * Seçilen tarih ve kişi sayısı için her odanın toplam fiyatı. Her gece kendi
 * dönemi/kampanyasıyla ayrı fiyatlanır (AI fiyat motoruyla aynı kurallar).
 * Uygun odalar önce, kendi içinde en ucuzdan pahalıya.
 */
export function quoteStay(pricing: QuotePricing, stay: StaySearch, today: string): StayQuote {
  if (!stay.checkIn || !stay.checkOut) return { ok: false, error: "Giriş ve çıkış tarihi seçin." };
  if (stay.checkIn < today) return { ok: false, error: "Giriş tarihi geçmişte kalıyor." };
  const nights = eachStayNight(stay.checkIn, stay.checkOut);
  if (nights.length > MAX_QUOTE_NIGHTS) {
    return { ok: false, error: `${MAX_QUOTE_NIGHTS} geceden uzun konaklamalar için fiyatı otel belirler; talep gönderin.` };
  }
  const guestCount = stay.adults;
  if (pricing.closedRanges?.length && overlapsClosedRange(stay.checkIn, stay.checkOut, pricing.closedRanges)) {
    return { ok: false, error: "Otel bu tarihlerde satışa kapalı. Başka tarih seçin." };
  }
  const { checkIn, checkOut } = stay;

  const rooms = pricing.rooms.map((room): RoomQuote => {
    const fit = roomCapacityFit(room, stay);
    // Gece gece fiyat + kal-öde: AI fiyat kartıyla aynı ortak hesap.
    // "Talep üzerine" oda dönem fiyatı olan gecelerde fiyatlanır.
    const q = quoteStayNights(
      {
        room: {
          id: room.id,
          priceMinor: room.priceMinor,
          currency: room.currency,
          priceOnRequest: room.priceOnRequest,
          discountPercent: room.discountPercent,
          discountLabel: room.discountLabel,
          minStayNights: room.minStayNights,
          childAgePrices: room.childAgePrices,
        },
        rates: room.rates,
        promotions: pricing.promotions,
        ratePlanPrices: pricing.ratePlanPrices,
        guestCount,
        childAges: stay.childAges,
      },
      nights,
    );
    const restriction = roomRestriction(pricing.restrictions?.[room.id], checkIn, checkOut, nights);
    const minStay = Math.max(q.minStayNights, restriction.minStay);
    return {
      slug: room.slug,
      name: room.name,
      imageUrl: room.imageUrl,
      boardType: room.boardType,
      fit,
      totalMinor: q.totalMinor,
      originalTotalMinor: q.originalTotalMinor,
      currency: q.currency,
      discountLabel: q.totalMinor == null ? null : q.discountLabel,
      freeNights: q.stayPromotion?.freeNights ?? 0,
      unavailable: restriction.reason,
      minStayShortfall: minStay > nights.length ? minStay : null,
    };
  });

  const fitRank: Record<CapacityFit, number> = { fits: 0, confirm: 1, no: 2 };
  rooms.sort(
    (a, b) =>
      Number(a.unavailable != null) - Number(b.unavailable != null) ||
      fitRank[a.fit] - fitRank[b.fit] ||
      (a.totalMinor ?? Number.MAX_SAFE_INTEGER) - (b.totalMinor ?? Number.MAX_SAFE_INTEGER),
  );
  return { ok: true, nights: nights.length, rooms };
}

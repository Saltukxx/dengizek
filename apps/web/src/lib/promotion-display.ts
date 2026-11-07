// ---------------------------------------------------------------------------
// Kampanyaların misafire anlatımı — otel kartı etiketi, otel sayfasındaki
// kampanya bölümü ve fiyat hesaplayıcının "bir gece daha kalın" ipucu.
// İstemci ve sunucuda çalışır (DB'ye dokunmaz).
// ---------------------------------------------------------------------------

import type { GuestPromotion, StayPayTier } from "@/lib/guest-pricing";

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

/** "21 Kasım" — yıl bugünkü yıldan farklıysa eklenir. */
export function formatDayTr(iso: string, today: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const sameYear = today.slice(0, 4) === String(y);
  return `${d} ${MONTHS[(m ?? 1) - 1]}${sameYear ? "" : ` ${y}`}`;
}

function sortedTiers(p: GuestPromotion): StayPayTier[] {
  return [...(p.stayPayTiers ?? [])].filter((t) => t.pay < t.stay).sort((a, b) => a.stay - b.stay);
}

/**
 * Misafire şu an gösterilecek kampanyalar: aktif, konaklama dönemi bitmemiş,
 * rezervasyon aralığı açık (son rezervasyon tarihi geçmemiş, erken
 * rezervasyon başlamış).
 */
export function guestVisiblePromotions(promotions: GuestPromotion[], today: string): GuestPromotion[] {
  return promotions.filter((p) => {
    if (!p.isActive) return false;
    if (!p.discountPercent && !sortedTiers(p).length) return false;
    if (p.validTo && p.validTo < today) return false;
    if (p.bookableTo && p.bookableTo < today) return false;
    if (p.bookableFrom && p.bookableFrom > today) return false;
    return true;
  });
}

/** Kısa ad: "4 kal 3 öde" ya da "%15 indirim". */
export function promotionShortLabel(p: GuestPromotion): string {
  const tiers = sortedTiers(p);
  if (tiers.length) return `${tiers[0].stay} kal ${tiers[0].pay} öde`;
  return `%${p.discountPercent} indirim`;
}

/** Başlık: tek basamak "4 kal 3 öde"; çok basamak "4 kal 3 öde · 8 kal 6 öde'ye kadar". */
export function promotionHeadline(p: GuestPromotion): string {
  const tiers = sortedTiers(p);
  if (tiers.length > 1) {
    const last = tiers[tiers.length - 1];
    return `${tiers[0].stay} kal ${tiers[0].pay} öde · ${last.stay} kal ${last.pay} öde'ye kadar`;
  }
  return promotionShortLabel(p);
}

/**
 * Basamakları sade cümleye çevirir; aynı hediyeyi veren ardışık basamaklar
 * birleşir: 4→3, 5→4, 6→5, 7→6, 8→6 → "4-7 gece kalana 1, 8 gece kalana 2 gece hediye".
 */
export function tierSummary(tiers: StayPayTier[]): string {
  const runs: { from: number; to: number; free: number }[] = [];
  for (const t of tiers) {
    const free = t.stay - t.pay;
    const last = runs[runs.length - 1];
    if (last && last.free === free && last.to === t.stay - 1) last.to = t.stay;
    else runs.push({ from: t.stay, to: t.stay, free });
  }
  return `${runs.map((r) => `${r.from === r.to ? r.from : `${r.from}-${r.to}`} gece kalana ${r.free}`).join(", ")} gece hediye`;
}

/** Konaklama süresi koşulu: "2-3 gecelik konaklamada", "en az 3 gece". */
function nightsCondition(p: GuestPromotion): string | null {
  const min = p.minNights ?? null;
  const max = p.maxNights ?? null;
  if (min != null && max != null) return min === max ? `${min} gecelik konaklamada` : `${min}-${max} gecelik konaklamada`;
  if (min != null && min > 1) return `en az ${min} gecelik konaklamada`;
  if (max != null) return `en fazla ${max} gecelik konaklamada`;
  return null;
}

export interface PromotionPeriod {
  /** "14 – 21 Kasım" ya da "30 Aralık'a kadar"; dönem sınırı yoksa null. */
  label: string | null;
  /** "21 Kasım" — son rezervasyon tarihi varsa. */
  bookableTo: string | null;
}

export interface PromotionDisplay {
  name: string;
  headline: string;
  /** Kampanyanın kuralları (dönem hariç) — her biri ayrı satır. */
  conditions: string[];
  /** Geçerli konaklama dönemleri; aynı kurallı kampanyalar tek kartta toplanır. */
  periods: PromotionPeriod[];
  /** Kontenjanla sınırlı mı? */
  limited: boolean;
}

function periodOf(p: GuestPromotion, today: string): PromotionPeriod {
  let label: string | null = null;
  const from = p.validFrom && p.validFrom > today ? p.validFrom : today;
  if (p.validTo) label = `${formatDayTr(from, today)} – ${formatDayTr(p.validTo, today)}`;
  else if (p.validFrom && p.validFrom > today) label = `${formatDayTr(p.validFrom, today)} tarihinden itibaren`;
  return { label, bookableTo: p.bookableTo ? formatDayTr(p.bookableTo, today) : null };
}

/** Kampanyanın misafire anlatımı (tek dönem). */
export function describePromotion(
  p: GuestPromotion,
  today: string,
  roomNames: Record<string, string> = {},
): PromotionDisplay {
  const conditions: string[] = [];
  const tiers = sortedTiers(p);
  if (tiers.length) {
    conditions.push(tierSummary(tiers));
    if (p.freeNightRule === "hafta_ici") conditions.push("Hediye gece hafta içinden düşülür");
  }
  const nights = nightsCondition(p);
  if (nights) conditions.push(nights);
  const rooms = p.roomIds.map((id) => roomNames[id]).filter(Boolean);
  if (rooms.length) conditions.push(rooms.length === 1 ? `Yalnız ${rooms[0]}` : `${rooms.join(", ")} odalarında`);
  return {
    name: p.name,
    headline: promotionHeadline(p),
    conditions,
    periods: [periodOf(p, today)],
    limited: p.allotment != null,
  };
}

/**
 * Aynı kurallı kampanyalar (ör. aynı "Çok kal az öde"nin üç ayrı dönemi) tek
 * kartta toplanır; dönemler sıralı listelenir.
 */
export function groupedPromotionDisplays(
  promotions: GuestPromotion[],
  today: string,
  roomNames: Record<string, string> = {},
): PromotionDisplay[] {
  const groups = new Map<string, PromotionDisplay>();
  const sorted = guestVisiblePromotions(promotions, today).sort((a, b) => (a.validFrom ?? "").localeCompare(b.validFrom ?? ""));
  for (const p of sorted) {
    const d = describePromotion(p, today, roomNames);
    const key = JSON.stringify([d.name, d.headline, d.conditions, d.limited]);
    const existing = groups.get(key);
    if (existing) existing.periods.push(...d.periods);
    else groups.set(key, d);
  }
  return [...groups.values()];
}

/**
 * Otel kartındaki etiket: en cömert kampanya (kal-öde için hediye gece
 * oranı, yüzde için indirim oranı). Kampanya yoksa null.
 */
export function bestPromotionBadge(promotions: GuestPromotion[], today: string): string | null {
  const visible = guestVisiblePromotions(promotions, today);
  if (!visible.length) return null;
  const value = (p: GuestPromotion) => {
    const tiers = sortedTiers(p);
    if (tiers.length) return Math.max(...tiers.map((t) => ((t.stay - t.pay) / t.stay) * 100));
    return p.discountPercent ?? 0;
  };
  const best = [...visible].sort((a, b) => value(b) - value(a))[0];
  return promotionShortLabel(best);
}

/**
 * "Bir gece daha kalın" ipucu: seçilen konaklama bir kal-öde basamağına 1-2
 * gece uzaktaysa. Uzatılmış konaklamanın tamamı kampanya dönemi içinde
 * olmalı ve kampanya bu oda için geçerli olmalı.
 */
export function stayPayUpsell(
  promotions: GuestPromotion[],
  roomIds: string[],
  checkIn: string,
  nights: number,
  today: string,
): { text: string; extraNights: number } | null {
  for (const p of guestVisiblePromotions(promotions, today)) {
    const tiers = sortedTiers(p);
    if (!tiers.length) continue;
    if (p.roomIds.length && !roomIds.some((id) => p.roomIds.includes(id))) continue;
    // Şu anki süreye uyan basamaktan daha fazla hediye veren ilk basamak.
    const current = tiers.filter((t) => t.stay <= nights).at(-1);
    const currentFree = current ? current.stay - current.pay : 0;
    const next = tiers.find((t) => t.stay > nights && t.stay - t.pay > currentFree);
    if (!next || next.stay - nights > 2) continue;
    const lastNight = new Date(`${checkIn}T12:00:00.000Z`);
    lastNight.setUTCDate(lastNight.getUTCDate() + next.stay - 1);
    const last = lastNight.toISOString().slice(0, 10);
    if (p.validFrom && checkIn < p.validFrom) continue;
    if (p.validTo && last > p.validTo) continue;
    if (p.maxNights != null && next.stay > p.maxNights) continue;
    const extra = next.stay - nights;
    const free = next.stay - next.pay;
    return {
      text: `${extra} gece daha kalırsanız ${p.name} ile ${free} geceniz ücretsiz (${next.stay} kal ${next.pay} öde).`,
      extraNights: extra,
    };
  }
  return null;
}

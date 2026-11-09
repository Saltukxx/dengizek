// ---------------------------------------------------------------------------
// Kampanya kontenjanı — "Kontenjan: 10" türü kampanyalarda oda tipi başına
// gecelik satış sınırı. Kullanım, o kampanyayla açılmış (iptal / gelmedi
// olmayan) rezervasyonlardan sayılır; dolan gecede kampanya uygulanmaz.
// ---------------------------------------------------------------------------

import { and, eq, gte, inArray, notInArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookingsTable, promotionsTable } from "@/lib/db/schema";
import { eachStayNight } from "@/lib/stay-dates";

/** Kontenjanı sayılmayan rezervasyon durumları. */
const RELEASED = ["iptal", "no_show"] as const;

export interface AllotmentPromotion {
  id: string;
  allotment: number | null;
  roomIds: string[];
}

/** Kampanya → oda → kullanılan gece sayısı (tarih → adet). */
export type PromotionUsage = Map<string, Map<string, Map<string, number>>>;

export function countPromotionUsage(
  bookings: { promotionId: string | null; roomId: string | null; checkIn: string; checkOut: string }[],
): PromotionUsage {
  const usage: PromotionUsage = new Map();
  for (const b of bookings) {
    if (!b.promotionId || !b.roomId) continue;
    const byRoom = usage.get(b.promotionId) ?? new Map<string, Map<string, number>>();
    const byDate = byRoom.get(b.roomId) ?? new Map<string, number>();
    for (const night of eachStayNight(b.checkIn, b.checkOut)) byDate.set(night, (byDate.get(night) ?? 0) + 1);
    byRoom.set(b.roomId, byDate);
    usage.set(b.promotionId, byRoom);
  }
  return usage;
}

/** Kontenjanı dolmuş geceler: oda kimliği → tarihler. */
export function soldOutNights(promo: AllotmentPromotion, usage: PromotionUsage): Record<string, string[]> {
  if (promo.allotment == null) return {};
  const out: Record<string, string[]> = {};
  for (const [roomId, byDate] of usage.get(promo.id) ?? []) {
    const full = [...byDate].filter(([, count]) => count >= (promo.allotment as number)).map(([date]) => date).sort();
    if (full.length) out[roomId] = full;
  }
  return out;
}

/** Kontenjanlı kampanyaların bugünden sonraki kullanımı (tek sorgu). */
export async function loadPromotionUsage(hotelId: string, promotionIds: string[], fromDate: string): Promise<PromotionUsage> {
  if (!promotionIds.length) return new Map();
  const rows = await getDb()
    .select({
      promotionId: bookingsTable.promotionId,
      roomId: bookingsTable.roomId,
      checkIn: bookingsTable.checkIn,
      checkOut: bookingsTable.checkOut,
    })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.hotelId, hotelId),
        inArray(bookingsTable.promotionId, promotionIds),
        gte(bookingsTable.checkOut, fromDate),
        notInArray(bookingsTable.status, [...RELEASED]),
      ),
    );
  return countPromotionUsage(rows.map((r) => ({ ...r, checkIn: String(r.checkIn), checkOut: String(r.checkOut) })));
}

/**
 * Rezervasyon bu kampanyayla açılabilir mi? Kampanya bu otelin olmalı, oda
 * kampanyanın odaları arasında olmalı ve hiçbir gecede kontenjan dolmamalı.
 */
export async function checkPromotionForBooking(
  hotelId: string,
  input: { promotionId?: string | null; roomId?: string | null; checkIn: string; checkOut: string },
): Promise<{ ok: true } | { ok: false; error: string; status: 400 | 404 | 409 }> {
  if (!input.promotionId) return { ok: true };
  const [promo] = await getDb()
    .select({ id: promotionsTable.id, allotment: promotionsTable.allotment, roomIds: promotionsTable.roomIds })
    .from(promotionsTable)
    .where(and(eq(promotionsTable.id, input.promotionId), eq(promotionsTable.hotelId, hotelId)))
    .limit(1);
  if (!promo) return { ok: false, error: "Kampanya bulunamadı.", status: 404 };
  if (promo.roomIds.length && (!input.roomId || !promo.roomIds.includes(input.roomId))) {
    return { ok: false, error: "Bu kampanya seçilen oda için geçerli değil.", status: 400 };
  }
  if (promo.allotment == null || !input.roomId) return { ok: true };
  const usage = await loadPromotionUsage(hotelId, [promo.id], input.checkIn);
  const byDate = usage.get(promo.id)?.get(input.roomId);
  const full = eachStayNight(input.checkIn, input.checkOut).find((night) => (byDate?.get(night) ?? 0) >= (promo.allotment as number));
  return full
    ? { ok: false, error: `Kampanya kontenjanı ${full} gecesi için dolu.`, status: 409 }
    : { ok: true };
}

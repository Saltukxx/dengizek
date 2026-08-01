// ---------------------------------------------------------------------------
// iCal içe aktarma — dış kanal (Booking.com, Airbnb, Google) takvimlerindeki
// meşguliyeti oda envanterine "satışa kapalı" olarak yazar.
//
// Kurallar:
//  - Feed bir odaya bağlı olmalı (hotel_ical_feeds.room_id); bağlı değilse
//    atlanır — hangi odanın kapanacağı belirsizken envantere dokunulmaz.
//  - Elle girilmiş satırlar (manual_override = true) EZİLMEZ; otelin kendi
//    kararı dış kaynağı yener.
//  - Bir önceki senkronun kapattığı ama artık feed'de olmayan günler yeniden
//    açılır (source = 'ical' olan satırlar bu senkronun sahibidir).
// ---------------------------------------------------------------------------

import { and, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { hotelIcalFeedsTable, roomInventoryTable } from "@/lib/db/schema";
import { eachStayNight } from "@/lib/stay-dates";
import { parseIcal } from "@/lib/ical/parse";

/** Dış akış tek bir isteği süresiz bekletmesin. */
const FETCH_TIMEOUT_MS = 15_000;
const MAX_FEED_BYTES = 2_000_000;

export interface FeedSyncResult {
  feedId: string;
  name: string;
  ok: boolean;
  events?: number;
  blockedNights?: number;
  releasedNights?: number;
  error?: string;
}

async function fetchFeed(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: "text/calendar, text/plain" },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Takvim alınamadı (HTTP ${res.status}).`);
  }
  const text = await res.text();
  if (text.length > MAX_FEED_BYTES) {
    throw new Error("Takvim dosyası çok büyük.");
  }
  return text;
}

/** Feed'deki olayları gece listesine çevirir (DTEND hariç). */
export function nightsFromEvents(events: { start: string; end: string }[]): string[] {
  const nights = new Set<string>();
  for (const event of events) {
    for (const night of eachStayNight(event.start, event.end)) {
      nights.add(night);
    }
  }
  return [...nights].sort();
}

async function syncFeed(
  db: ReturnType<typeof getDb>,
  feed: {
    id: string;
    name: string;
    hotelId: string;
    roomId: string | null;
    importUrl: string | null;
  },
): Promise<FeedSyncResult> {
  const base = { feedId: feed.id, name: feed.name };
  if (!feed.importUrl) return { ...base, ok: true, events: 0 };
  if (!feed.roomId) {
    return { ...base, ok: false, error: "Feed bir odaya bağlanmamış." };
  }

  const events = parseIcal(await fetchFeed(feed.importUrl));
  const nights = nightsFromEvents(events);

  // 1) Feed'in kapattığı geceleri yaz. manual_override satırlarına dokunma.
  for (const date of nights) {
    await db
      .insert(roomInventoryTable)
      .values({
        hotelId: feed.hotelId,
        roomId: feed.roomId,
        date,
        allotment: 0,
        stopSell: true,
        source: "ical",
        manualOverride: false,
      })
      .onConflictDoUpdate({
        target: [roomInventoryTable.roomId, roomInventoryTable.date],
        set: { stopSell: true, allotment: 0, source: "ical" },
        setWhere: eq(roomInventoryTable.manualOverride, false),
      });
  }

  // 2) Artık feed'de olmayan, önceki senkronun kapattığı geceleri serbest bırak.
  const released = await db
    .update(roomInventoryTable)
    .set({ stopSell: false })
    .where(
      and(
        eq(roomInventoryTable.roomId, feed.roomId),
        eq(roomInventoryTable.source, "ical"),
        eq(roomInventoryTable.manualOverride, false),
        eq(roomInventoryTable.stopSell, true),
        nights.length > 0 ? notInArray(roomInventoryTable.date, nights) : undefined,
      ),
    )
    .returning();

  return {
    ...base,
    ok: true,
    events: events.length,
    blockedNights: nights.length,
    releasedNights: released.length,
  };
}

/**
 * importUrl tanımlı tüm feed'leri senkronize eder. Bir feed'in hatası
 * diğerlerini durdurmaz; hata feed satırına yazılır ve panelde gösterilir.
 */
export async function syncIcalFeeds(feedIds?: string[]): Promise<FeedSyncResult[]> {
  const db = getDb();
  const feeds = await db
    .select({
      id: hotelIcalFeedsTable.id,
      name: hotelIcalFeedsTable.name,
      hotelId: hotelIcalFeedsTable.hotelId,
      roomId: hotelIcalFeedsTable.roomId,
      importUrl: hotelIcalFeedsTable.importUrl,
    })
    .from(hotelIcalFeedsTable)
    .where(
      and(
        isNotNull(hotelIcalFeedsTable.importUrl),
        feedIds?.length ? inArray(hotelIcalFeedsTable.id, feedIds) : undefined,
      ),
    );

  const results: FeedSyncResult[] = [];
  for (const feed of feeds) {
    try {
      const result = await syncFeed(db, feed);
      await db
        .update(hotelIcalFeedsTable)
        .set({
          lastSyncAt: new Date(),
          lastSyncError: result.ok ? null : (result.error ?? null),
        })
        .where(eq(hotelIcalFeedsTable.id, feed.id));
      results.push(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 500) : "Bilinmeyen hata";
      await db
        .update(hotelIcalFeedsTable)
        .set({ lastSyncAt: new Date(), lastSyncError: message })
        .where(eq(hotelIcalFeedsTable.id, feed.id));
      results.push({ feedId: feed.id, name: feed.name, ok: false, error: message });
    }
  }
  return results;
}

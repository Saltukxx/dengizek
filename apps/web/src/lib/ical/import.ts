// ---------------------------------------------------------------------------
// iCal içe aktarma — dış kanal (Booking.com, Airbnb, Google) takvimlerindeki
// meşguliyeti oda envanterine "satışa kapalı" olarak yazar.
//
// Kurallar:
//  - Feed bir odaya bağlı olmalı (hotel_ical_feeds.room_id); bağlı değilse
//    atlanır — hangi odanın kapanacağı belirsizken envantere dokunulmaz.
//  - Elle girilmiş satırlar (manual_override = true) EZİLMEZ; otelin kendi
//    kararı dış kaynağı yener.
//  - Yalnız stop_sell yazılır; allotment'a dokunulmaz. allotment onaylı
//    rezervasyonların düşümünü taşır — sıfırlanırsa dış rezervasyon kalkınca
//    gece bir daha satılamaz.
//  - Senkron ODA bazındadır: aynı odaya bağlı feed'lerin geceleri birleştirilir.
//    Feed başına yapılırsa her feed diğerinin kapattığı geceleri açar.
//  - Bir önceki senkronun kapattığı ama artık hiçbir feed'de olmayan geceler
//    yeniden açılır (source = 'ical' satırlar bu senkronun sahibidir) — yalnız
//    odanın TÜM feed'leri okunabildiyse; eksik veriyle gece açılmaz.
// ---------------------------------------------------------------------------

import { and, eq, gte, isNotNull, ne, notInArray, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { withTransaction } from "@/lib/db/transaction";
import { hotelIcalFeedsTable, roomInventoryTable, roomsTable } from "@/lib/db/schema";
import { addDays } from "@/lib/booking-stay";
import { fetchIcalFeed } from "@/lib/ical/fetch";
import { parseIcal } from "@/lib/ical/parse";
import { bumpPanelRevision, lockPanelRevision } from "@/lib/panel-revision";
import { todayIso } from "@/lib/price";
import { eachStayNight } from "@/lib/stay-dates";

/** Bugünden itibaren işlenen pencere — uzak gelecekteki olaylar kırpılır. */
const SYNC_WINDOW_DAYS = 730;
const INSERT_CHUNK = 250;
/** Aynı anda senkronlanan oda sayısı. */
const ROOM_CONCURRENCY = 4;

export interface FeedSyncResult {
  feedId: string;
  name: string;
  ok: boolean;
  events?: number;
  blockedNights?: number;
  releasedNights?: number;
  error?: string;
}

interface Feed {
  id: string;
  name: string;
  hotelId: string;
  roomId: string | null;
  importUrl: string | null;
}

/**
 * Feed'deki olayları gece listesine çevirir (DTEND hariç). Pencere verilirse
 * olaylar açılmadan ÖNCE [from, to) aralığına kırpılır — yüz yıllık tek bir
 * olay yüz binlerce gece üretmesin.
 */
export function nightsFromEvents(
  events: { start: string; end: string }[],
  window?: { from: string; to: string },
): string[] {
  const nights = new Set<string>();
  for (const event of events) {
    const start = window && event.start < window.from ? window.from : event.start;
    const end = window && event.end > window.to ? window.to : event.end;
    for (const night of eachStayNight(start, end)) {
      nights.add(night);
    }
  }
  return [...nights].sort();
}

/** Bir odanın kapalı gecelerini yazar; release açıksa artık kapalı olmayanları açar. */
async function applyRoomBlocks(
  hotelId: string,
  roomId: string,
  nights: string[],
  today: string,
  release: boolean,
): Promise<{ blocked: number; released: number }> {
  return withTransaction(async (tx) => {
    const [room] = await tx
      .select({ unitCount: roomsTable.unitCount })
      .from(roomsTable)
      .where(and(eq(roomsTable.id, roomId), eq(roomsTable.hotelId, hotelId)))
      .limit(1);
    if (!room) throw new Error("Feed'in bağlı olduğu oda bulunamadı.");

    // Envanter paneliyle aynı kilit sırası: önce revizyon, sonra satırlar.
    await lockPanelRevision(tx, hotelId, "inventory");

    let blocked = 0;
    for (let i = 0; i < nights.length; i += INSERT_CHUNK) {
      const changed = await tx
        .insert(roomInventoryTable)
        .values(
          nights.slice(i, i + INSERT_CHUNK).map((date) => ({
            hotelId,
            roomId,
            date,
            // Satırı olmayan gece: düşüm yapılmamıştır, tam kapasiteyle açılır.
            allotment: room.unitCount ?? 0,
            stopSell: true,
            source: "ical",
            manualOverride: false,
          })),
        )
        .onConflictDoUpdate({
          target: [roomInventoryTable.roomId, roomInventoryTable.date],
          set: { stopSell: true, source: "ical" },
          // Zaten bu senkronun kapattığı satır yeniden yazılmaz.
          setWhere: and(
            eq(roomInventoryTable.manualOverride, false),
            or(eq(roomInventoryTable.stopSell, false), ne(roomInventoryTable.source, "ical")),
          ),
        })
        .returning();
      blocked += changed.length;
    }

    let released = 0;
    if (release) {
      const reopened = await tx
        .update(roomInventoryTable)
        .set({ stopSell: false, source: "system" })
        .where(
          and(
            eq(roomInventoryTable.roomId, roomId),
            eq(roomInventoryTable.source, "ical"),
            eq(roomInventoryTable.manualOverride, false),
            eq(roomInventoryTable.stopSell, true),
            gte(roomInventoryTable.date, today),
            nights.length > 0 ? notInArray(roomInventoryTable.date, nights) : undefined,
          ),
        )
        .returning();
      released = reopened.length;
    }

    if (blocked + released > 0) await bumpPanelRevision(tx, hotelId, "inventory");
    return { blocked, released };
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "Bilinmeyen hata";
}

async function syncRoom(roomId: string, feeds: Feed[]): Promise<FeedSyncResult[]> {
  const today = todayIso();
  const window = { from: today, to: addDays(today, SYNC_WINDOW_DAYS) };

  const fetched = await Promise.all(
    feeds.map(async (feed) => {
      try {
        const events = parseIcal(await fetchIcalFeed(feed.importUrl!));
        return { feed, events: events.length, nights: nightsFromEvents(events, window) };
      } catch (error) {
        return { feed, error: errorMessage(error) };
      }
    }),
  );

  const nights = [...new Set(fetched.flatMap((entry) => entry.nights ?? []))].sort();
  const allFetched = fetched.every((entry) => !entry.error);

  let applied: { blocked: number; released: number };
  try {
    applied = await applyRoomBlocks(feeds[0].hotelId, roomId, nights, today, allFetched);
  } catch (error) {
    const message = errorMessage(error);
    return feeds.map((feed) => ({ feedId: feed.id, name: feed.name, ok: false, error: message }));
  }

  return fetched.map((entry) =>
    entry.error
      ? { feedId: entry.feed.id, name: entry.feed.name, ok: false, error: entry.error }
      : {
          feedId: entry.feed.id,
          name: entry.feed.name,
          ok: true,
          events: entry.events,
          blockedNights: entry.nights?.length ?? 0,
          releasedNights: applied.released,
        },
  );
}

/**
 * importUrl tanımlı tüm feed'leri senkronize eder. Bir odanın hatası
 * diğerlerini durdurmaz; hata feed satırına yazılır ve panelde gösterilir.
 */
export async function syncIcalFeeds(): Promise<FeedSyncResult[]> {
  const db = getDb();
  const feeds: Feed[] = await db
    .select({
      id: hotelIcalFeedsTable.id,
      name: hotelIcalFeedsTable.name,
      hotelId: hotelIcalFeedsTable.hotelId,
      roomId: hotelIcalFeedsTable.roomId,
      importUrl: hotelIcalFeedsTable.importUrl,
    })
    .from(hotelIcalFeedsTable)
    .where(isNotNull(hotelIcalFeedsTable.importUrl));

  const results: FeedSyncResult[] = [];
  const byRoom = new Map<string, Feed[]>();
  for (const feed of feeds) {
    if (!feed.roomId) {
      results.push({ feedId: feed.id, name: feed.name, ok: false, error: "Feed bir odaya bağlanmamış." });
      continue;
    }
    byRoom.set(feed.roomId, [...(byRoom.get(feed.roomId) ?? []), feed]);
  }

  const queue = [...byRoom.entries()];
  await Promise.all(
    Array.from({ length: Math.min(ROOM_CONCURRENCY, queue.length) }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        results.push(...(await syncRoom(next[0], next[1])));
      }
    }),
  );

  for (const result of results) {
    await db
      .update(hotelIcalFeedsTable)
      .set({ lastSyncAt: new Date(), lastSyncError: result.ok ? null : (result.error ?? null) })
      .where(eq(hotelIcalFeedsTable.id, result.feedId));
  }
  return results;
}

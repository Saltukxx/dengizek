import { and, eq, gte, sql } from "drizzle-orm";
import { getDb, type Tx } from "@/lib/db";
import { roomInventoryTable } from "@/lib/db/schema";
import { bumpPanelRevision } from "@/lib/panel-revision";
import { todayIso } from "@/lib/price";

/** Envanterin ileriye doğru tutulduğu süre. */
export const INVENTORY_HORIZON_MONTHS = 18;

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }

export async function seedRoomInventory(tx: Tx, hotelId: string, roomId: string, unitCount: number | null | undefined, months = INVENTORY_HORIZON_MONTHS) {
  const start = new Date();
  start.setUTCHours(12, 0, 0, 0);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + months);
  const rows = [];
  for (const day = new Date(start); day < end; day.setUTCDate(day.getUTCDate() + 1)) {
    rows.push({ hotelId, roomId, date: isoDate(day), allotment: unitCount ?? 0, stopSell: false, cta: false, ctd: false, source: "system", manualOverride: false });
  }
  for (let i = 0; i < rows.length; i += 250) {
    await tx.insert(roomInventoryTable).values(rows.slice(i, i + 250)).onConflictDoNothing();
  }
}

/**
 * Birim sayısı değişince gelecekteki sistem satırlarına FARKI uygular.
 * allotment "kalan" sayıdır: mutlak değer yazmak onaylı rezervasyonların
 * düşümlerini siler ve oda yeniden satılabilir görünür. Elle girilmiş satırlar
 * otelin kendi kararıdır, dokunulmaz.
 */
export async function syncSystemInventoryCapacity(
  tx: Tx,
  hotelId: string,
  roomId: string,
  previousUnitCount: number | null | undefined,
  unitCount: number | null | undefined,
) {
  const delta = (unitCount ?? 0) - (previousUnitCount ?? 0);
  if (delta === 0) return;
  await bumpPanelRevision(tx, hotelId, "inventory");
  await tx.update(roomInventoryTable)
    .set({ allotment: sql`GREATEST(0, ${roomInventoryTable.allotment} + ${delta})` })
    .where(and(eq(roomInventoryTable.roomId, roomId), eq(roomInventoryTable.manualOverride, false), gte(roomInventoryTable.date, todayIso())));
}

/**
 * Envanter ufkunu ileri taşır (cron). Oda oluşturulurken yalnız 18 ay
 * tohumlanır; bu çalışmazsa ufuk her gün bir gün kısalır. Ufkun son günü
 * eksik olan odalar için tüm pencere taranır ve yalnız olmayan geceler
 * eklenir — var olan satırlara (düşümler, elle girişler) dokunulmaz.
 */
export async function extendInventoryHorizon(months = INVENTORY_HORIZON_MONTHS): Promise<number> {
  const horizon = sql`(CURRENT_DATE + ${months} * INTERVAL '1 month')::date`;
  const result = await getDb().execute(sql`
    INSERT INTO room_inventory (hotel_id, room_id, date, allotment, stop_sell, cta, ctd, source, manual_override)
    SELECT r.hotel_id, r.id, d::date, COALESCE(r.unit_count, 0), false, false, false, 'system', false
    FROM rooms r
    CROSS JOIN generate_series(CURRENT_DATE::timestamp, ${horizon}::timestamp, INTERVAL '1 day') AS d
    WHERE NOT EXISTS (
      SELECT 1 FROM room_inventory i WHERE i.room_id = r.id AND i.date = ${horizon}
    )
    ON CONFLICT (room_id, date) DO NOTHING
    RETURNING id
  `);
  const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? [];
  return rows.length;
}

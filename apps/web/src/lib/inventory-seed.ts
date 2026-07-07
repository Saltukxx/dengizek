import { and, eq, gte } from "drizzle-orm";
import type { Tx } from "@/lib/db";
import { roomInventoryTable } from "@/lib/db/schema";

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }

export async function seedRoomInventory(tx: Tx, hotelId: string, roomId: string, unitCount: number | null | undefined, months = 18) {
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

export async function syncSystemInventoryCapacity(tx: Tx, roomId: string, unitCount: number | null | undefined) {
  await tx.update(roomInventoryTable).set({ allotment: unitCount ?? 0 })
    .where(and(eq(roomInventoryTable.roomId, roomId), eq(roomInventoryTable.manualOverride, false), gte(roomInventoryTable.date, isoDate(new Date()))));
}

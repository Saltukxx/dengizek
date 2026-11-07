// ---------------------------------------------------------------------------
// Satış kısıtları (stop sale) — envanter tablosundaki oda-gece kayıtları:
// satışa kapalı, dolu, girişe kapalı (CTA), çıkışa kapalı (CTD) ve minimum
// konaklama. Misafir fiyat hesaplayıcısı bunlara uyar; kaydı olmayan gece
// için kısıt yoktur (otel talepte teyit eder).
// ---------------------------------------------------------------------------

import { and, eq, gte, isNotNull, lte, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { roomInventoryTable } from "@/lib/db/schema";
import type { StayRestrictions } from "@/lib/stay-search";

/** Yalnız kısıt taşıyan geceler okunur (ufuk: 18 ay). */
export async function loadStayRestrictions(hotelId: string, fromDate: string, toDate: string): Promise<StayRestrictions> {
  const rows = await getDb()
    .select({
      roomId: roomInventoryTable.roomId,
      date: roomInventoryTable.date,
      allotment: roomInventoryTable.allotment,
      stopSell: roomInventoryTable.stopSell,
      minStay: roomInventoryTable.minStay,
      cta: roomInventoryTable.cta,
      ctd: roomInventoryTable.ctd,
    })
    .from(roomInventoryTable)
    .where(
      and(
        eq(roomInventoryTable.hotelId, hotelId),
        gte(roomInventoryTable.date, fromDate),
        lte(roomInventoryTable.date, toDate),
        or(
          eq(roomInventoryTable.stopSell, true),
          lte(roomInventoryTable.allotment, 0),
          eq(roomInventoryTable.cta, true),
          eq(roomInventoryTable.ctd, true),
          isNotNull(roomInventoryTable.minStay),
        ),
      ),
    )
    .limit(20_000);
  const out: StayRestrictions = {};
  for (const r of rows) {
    const day = (out[r.roomId] ??= {});
    day[String(r.date)] = {
      ...(r.stopSell ? { stopSell: true } : {}),
      ...(r.allotment <= 0 ? { full: true } : {}),
      ...(r.cta ? { cta: true } : {}),
      ...(r.ctd ? { ctd: true } : {}),
      ...(r.minStay ? { minStay: r.minStay } : {}),
    };
  }
  return out;
}

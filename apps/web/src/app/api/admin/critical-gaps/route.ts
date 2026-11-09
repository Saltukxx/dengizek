// ---------------------------------------------------------------------------
// GET /api/admin/critical-gaps — otel başına kritik bilgi eksikleri (taslak
// veri): giriş/çıkış saati, evcil hayvan, yeme-içme konsepti, oda kapasitesi.
// Aktarım sonrası hangi otelin neyi eksik olduğunu tek listede gösterir.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { hotelsTable, roomsTable } from "@/lib/db/schema";
import { criticalGaps, type CriticalGap } from "@/lib/ai/readiness-score";

export async function GET() {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const db = getDb();
  const [hotels, rooms] = await Promise.all([
    db
      .select({
        id: hotelsTable.id,
        slug: hotelsTable.slug,
        name: hotelsTable.name,
        status: hotelsTable.status,
        checkInTime: hotelsTable.checkInTime,
        checkOutTime: hotelsTable.checkOutTime,
        petsAllowed: hotelsTable.petsAllowed,
        aiFacts: hotelsTable.aiFacts,
        aiPolicies: hotelsTable.aiPolicies,
        cancellationPolicy: hotelsTable.cancellationPolicy,
        childPolicy: hotelsTable.childPolicy,
      })
      .from(hotelsTable),
    db
      .select({
        hotelId: roomsTable.hotelId,
        name: roomsTable.name,
        capacityAdults: roomsTable.capacityAdults,
        capacityChildren: roomsTable.capacityChildren,
        boardType: roomsTable.boardType,
        description: roomsTable.description,
      })
      .from(roomsTable)
      .where(eq(roomsTable.isActive, true)),
  ]);

  const report: Array<{ slug: string; name: string; status: string; gaps: CriticalGap[] }> = [];
  for (const hotel of hotels) {
    const gaps = criticalGaps({
      checkInTime: hotel.checkInTime,
      checkOutTime: hotel.checkOutTime,
      petsAllowed: hotel.petsAllowed,
      texts: [...hotel.aiFacts, ...hotel.aiPolicies, hotel.cancellationPolicy ?? "", hotel.childPolicy ?? ""],
      rooms: rooms.filter((r) => r.hotelId === hotel.id),
    });
    if (gaps.length) report.push({ slug: hotel.slug, name: hotel.name, status: hotel.status, gaps });
  }
  report.sort((a, b) => b.gaps.length - a.gaps.length || a.name.localeCompare(b.name, "tr"));

  const byField: Record<string, number> = {};
  for (const h of report) for (const g of h.gaps) byField[g.field] = (byField[g.field] ?? 0) + 1;

  return NextResponse.json({ ok: true, totalHotels: hotels.length, withGaps: report.length, byField, hotels: report });
}

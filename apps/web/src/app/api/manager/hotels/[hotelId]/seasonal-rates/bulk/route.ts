// ---------------------------------------------------------------------------
// POST /api/manager/hotels/[hotelId]/seasonal-rates/bulk
// Toplu silme veya seçili odalara aynı dönemi ekleme.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { roomRatesTable, roomsTable } from "@/lib/db/schema";
import { logAudit } from "@/lib/audit";
import { seasonalRatesBulkActionSchema } from "@/lib/schemas/hotel-content";
import { syncRoomRates } from "@/lib/seasonal-rates-sync";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = seasonalRatesBulkActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();

  if (parsed.data.action === "delete") {
    const rows = await db
      .select({ id: roomRatesTable.id, roomId: roomRatesTable.roomId })
      .from(roomRatesTable)
      .where(
        and(
          eq(roomRatesTable.hotelId, guard.hotel.id),
          inArray(roomRatesTable.id, parsed.data.ids),
        ),
      );

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, deleted: 0 });
    }

    const affectedRoomIds = [...new Set(rows.map((r) => r.roomId))];
    await db
      .delete(roomRatesTable)
      .where(
        and(
          eq(roomRatesTable.hotelId, guard.hotel.id),
          inArray(roomRatesTable.id, rows.map((r) => r.id)),
        ),
      );

    await logAudit({
      actor: guard.user,
      action: "otel.donemfiyat.toplu_silindi",
      entityType: "hotel",
      entityId: guard.hotel.id,
      meta: { silinen: rows.length, odaSayisi: affectedRoomIds.length },
    });

    return NextResponse.json({ ok: true, deleted: rows.length });
  }

  const roomIds = parsed.data.roomIds;
  const validRooms = await db
    .select({ id: roomsTable.id })
    .from(roomsTable)
    .where(and(eq(roomsTable.hotelId, guard.hotel.id), inArray(roomsTable.id, roomIds)));

  if (validRooms.length !== roomIds.length) {
    return NextResponse.json({ ok: false, error: "Geçersiz oda seçimi." }, { status: 400 });
  }

  const period = parsed.data.period;
  let created = 0;

  for (const room of validRooms) {
    const existing = await db
      .select()
      .from(roomRatesTable)
      .where(eq(roomRatesTable.roomId, room.id))
      .orderBy(asc(roomRatesTable.startDate));

    if (existing.length >= 40) {
      return NextResponse.json(
        { ok: false, error: "Bir veya daha fazla odada dönem limiti (40) dolu." },
        { status: 400 },
      );
    }

    const next = [
      ...existing.map((r) => ({
        id: r.id,
        name: r.name,
        startDate: r.startDate,
        endDate: r.endDate,
        priceMinor: r.priceMinor,
        currency: r.currency as "TRY" | "EUR" | "USD",
        minStayNights: r.minStayNights,
        occupancyPrices: r.occupancyPrices ?? [],
      })),
      {
        name: period.name,
        startDate: period.startDate,
        endDate: period.endDate,
        priceMinor: period.priceMinor,
        currency: period.currency,
        minStayNights: period.minStayNights ?? null,
        occupancyPrices: period.occupancyPrices ?? [],
      },
    ];

    const result = await syncRoomRates(db, guard.hotel.id, room.id, next);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    created += 1;
  }

  await logAudit({
    actor: guard.user,
    action: "otel.donemfiyat.toplu_uygulandi",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { odaSayisi: created, donem: period.name },
  });

  return NextResponse.json({ ok: true, applied: created });
}

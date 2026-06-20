// ---------------------------------------------------------------------------
// PUT /api/manager/hotels/[hotelId]/seasonal-rates
// Birden fazla oda için dönemsel fiyat listelerini tek istekte senkronize eder.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { seasonalRatesBulkPutSchema } from "@/lib/schemas/hotel-content";
import { findHotelRoom, syncRoomRates } from "@/lib/seasonal-rates-sync";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function PUT(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = seasonalRatesBulkPutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const results: Record<string, Awaited<ReturnType<typeof syncRoomRates>>> = {};

  for (const item of parsed.data.rooms) {
    const room = await findHotelRoom(db, guard.hotel.id, item.roomId);
    if (!room) {
      return NextResponse.json(
        { ok: false, error: `Oda bulunamadı: ${item.roomId}` },
        { status: 404 },
      );
    }

    const result = await syncRoomRates(db, guard.hotel.id, room.id, item.donemler);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    results[room.id] = result;
  }

  await logAudit({
    actor: guard.user,
    action: "otel.donemfiyat.toplu_guncellendi",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { odaSayisi: parsed.data.rooms.length },
  });

  return NextResponse.json({ ok: true, results });
}

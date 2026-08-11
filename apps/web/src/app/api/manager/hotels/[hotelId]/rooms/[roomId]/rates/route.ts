// ---------------------------------------------------------------------------
// GET/PUT /api/manager/hotels/[hotelId]/rooms/[roomId]/rates
// Dönemsel fiyatlar — PUT tüm listeyi senkronize eder.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { roomRatesTable } from "@/lib/db/schema";
import { roomRatesPutSchema } from "@/lib/schemas/hotel-content";
import { logAudit } from "@/lib/audit";
import { findHotelRoom, syncRoomRates } from "@/lib/seasonal-rates-sync";
import {
  expectedRevisionRequiredResponse,
  getPanelRevision,
  panelRevisionConflictResponse,
  readExpectedRevision,
  runPanelMutation,
} from "@/lib/panel-revision";

type RouteParams = { params: Promise<{ hotelId: string; roomId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { hotelId, roomId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const db = getDb();
  const room = await findHotelRoom(db, guard.hotel.id, roomId);
  if (!room) {
    return NextResponse.json({ ok: false, error: "Oda bulunamadı." }, { status: 404 });
  }

  const rates = await db
    .select()
    .from(roomRatesTable)
    .where(eq(roomRatesTable.roomId, room.id))
    .orderBy(asc(roomRatesTable.startDate));
  const revision = await getPanelRevision(db, guard.hotel.id, "seasonal_rates");
  return NextResponse.json({ ok: true, rates, revision: revision.revision });
}

export async function PUT(req: Request, { params }: RouteParams) {
  const { hotelId, roomId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const expectedRevision = readExpectedRevision(body);
  if (!expectedRevision) return expectedRevisionRequiredResponse();
  const parsed = roomRatesPutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const room = await findHotelRoom(db, guard.hotel.id, roomId);
  if (!room) {
    return NextResponse.json({ ok: false, error: "Oda bulunamadı." }, { status: 404 });
  }

  // syncRoomRates önce siler sonra yazar — transaction olmadan araya giren bir
  // hata odanın tüm dönem fiyatlarını yok eder.
  try {
    const { result, revision } = await runPanelMutation({
      hotelId: guard.hotel.id,
      scope: "seasonal_rates",
      expectedRevision,
      updatedBy: guard.user.id,
      mutate: (tx) => syncRoomRates(tx, guard.hotel.id, room.id, parsed.data.donemler),
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }

    await logAudit({
      actor: guard.user,
      action: "oda.donemfiyat.guncellendi",
      entityType: "hotel",
      entityId: guard.hotel.id,
      meta: {
        roomSlug: room.slug,
        donemSayisi: parsed.data.donemler.length,
        silinen: result.deleted,
      },
    });

    return NextResponse.json({ ok: true, rates: result.rates, revision });
  } catch (err) {
    const conflict = panelRevisionConflictResponse(err);
    if (conflict) return conflict;
    throw err;
  }
}

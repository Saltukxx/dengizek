// ---------------------------------------------------------------------------
// PUT /api/manager/hotels/[hotelId]/seasonal-rates
// Birden fazla oda için dönemsel fiyat listelerini tek istekte senkronize eder.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";
import { seasonalRatesBulkPutSchema } from "@/lib/schemas/hotel-content";
import { findHotelRoom, syncRoomRates } from "@/lib/seasonal-rates-sync";
import { expectedRevisionRequiredResponse, panelRevisionConflictResponse, readExpectedRevision, runPanelMutation } from "@/lib/panel-revision";

type RouteParams = { params: Promise<{ hotelId: string }> };

class SeasonalRatesError extends Error {}

export async function PUT(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const expectedRevision = readExpectedRevision(body);
  if (!expectedRevision) return expectedRevisionRequiredResponse();
  const parsed = seasonalRatesBulkPutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const results: Record<string, Awaited<ReturnType<typeof syncRoomRates>>> = {};
  let revision: number;
  try {
    const mutation = await runPanelMutation({
      hotelId: guard.hotel.id, scope: "seasonal_rates", expectedRevision, updatedBy: guard.user.id,
      mutate: async (tx) => {
        for (const item of parsed.data.rooms) {
          const room = await findHotelRoom(tx, guard.hotel.id, item.roomId);
          if (!room) throw new SeasonalRatesError(`Oda bulunamadı: ${item.roomId}`);
          const result = await syncRoomRates(tx, guard.hotel.id, room.id, item.donemler);
          if (!result.ok) throw new SeasonalRatesError(result.error);
          results[room.id] = result;
        }
      },
    });
    revision = mutation.revision;
  } catch (error) {
    const conflict = panelRevisionConflictResponse(error); if (conflict) return conflict;
    if (error instanceof SeasonalRatesError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    throw error;
  }

  await logAudit({
    actor: guard.user,
    action: "otel.donemfiyat.toplu_guncellendi",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { odaSayisi: parsed.data.rooms.length },
  });

  return NextResponse.json({ ok: true, results, revision });
}

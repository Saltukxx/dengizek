// ---------------------------------------------------------------------------
// POST /api/manager/hotels/[hotelId]/seasonal-rates/bulk
// Toplu silme veya seçili odalara aynı dönemi ekleme.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { roomRatesTable, roomsTable } from "@/lib/db/schema";
import { logAudit } from "@/lib/audit";
import { seasonalRatesBulkActionSchema } from "@/lib/schemas/hotel-content";
import { syncRoomRates } from "@/lib/seasonal-rates-sync";
import { expectedRevisionRequiredResponse, panelRevisionConflictResponse, readExpectedRevision, runPanelMutation } from "@/lib/panel-revision";

type RouteParams = { params: Promise<{ hotelId: string }> };

class SeasonalRatesBulkError extends Error {}

export async function POST(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const expectedRevision = readExpectedRevision(body);
  if (!expectedRevision) return expectedRevisionRequiredResponse();
  const parsed = seasonalRatesBulkActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.action === "delete") {
    const ids = parsed.data.ids;
    try {
      const { result, revision } = await runPanelMutation({
        hotelId: guard.hotel.id, scope: "seasonal_rates", expectedRevision, updatedBy: guard.user.id,
        mutate: async (tx) => {
          const rows = await tx.select({ id: roomRatesTable.id, roomId: roomRatesTable.roomId })
            .from(roomRatesTable).where(and(
              eq(roomRatesTable.hotelId, guard.hotel.id), inArray(roomRatesTable.id, ids),
            ));
          if (rows.length > 0) await tx.delete(roomRatesTable).where(and(
            eq(roomRatesTable.hotelId, guard.hotel.id), inArray(roomRatesTable.id, rows.map((r) => r.id)),
          ));
          return { deleted: rows.length, roomCount: new Set(rows.map((r) => r.roomId)).size };
        },
      });

      await logAudit({
        actor: guard.user, action: "otel.donemfiyat.toplu_silindi",
        entityType: "hotel", entityId: guard.hotel.id,
        meta: { silinen: result.deleted, odaSayisi: result.roomCount },
      });

      return NextResponse.json({ ok: true, deleted: result.deleted, revision });
    } catch (error) { const conflict = panelRevisionConflictResponse(error); if (conflict) return conflict; throw error; }
  }

  const roomIds = parsed.data.roomIds;
  const period = parsed.data.period;
  let created = 0;
  let revision: number;
  try {
    const mutation = await runPanelMutation({
      hotelId: guard.hotel.id, scope: "seasonal_rates", expectedRevision, updatedBy: guard.user.id,
      mutate: async (tx) => {
        const validRooms = await tx.select({ id: roomsTable.id }).from(roomsTable).where(and(
          eq(roomsTable.hotelId, guard.hotel.id), inArray(roomsTable.id, roomIds),
        ));
        if (validRooms.length !== roomIds.length) throw new SeasonalRatesBulkError("Geçersiz oda seçimi.");
        for (const room of validRooms) {
          const existing = await tx.select().from(roomRatesTable)
            .where(eq(roomRatesTable.roomId, room.id)).orderBy(asc(roomRatesTable.startDate));
          if (existing.length >= 40) throw new SeasonalRatesBulkError("Bir veya daha fazla odada dönem limiti (40) dolu.");
          const next = [...existing.map((r) => ({
            id: r.id, name: r.name, startDate: r.startDate, endDate: r.endDate,
            priceMinor: r.priceMinor, currency: r.currency as "TRY" | "EUR" | "USD",
            minStayNights: r.minStayNights, occupancyPrices: r.occupancyPrices ?? [],
            childAgePrices: r.childAgePrices ?? [],
          })), {
            name: period.name, startDate: period.startDate, endDate: period.endDate,
            priceMinor: period.priceMinor, currency: period.currency,
            minStayNights: period.minStayNights ?? null,
            occupancyPrices: period.occupancyPrices ?? [], childAgePrices: period.childAgePrices ?? [],
          }];
          const result = await syncRoomRates(tx, guard.hotel.id, room.id, next);
          if (!result.ok) throw new SeasonalRatesBulkError(result.error);
          created += 1;
        }
      },
    });
    revision = mutation.revision;
  } catch (error) {
    const conflict = panelRevisionConflictResponse(error); if (conflict) return conflict;
    if (error instanceof SeasonalRatesBulkError) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    throw error;
  }

  await logAudit({
    actor: guard.user,
    action: "otel.donemfiyat.toplu_uygulandi",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { odaSayisi: created, donem: period.name },
  });

  return NextResponse.json({ ok: true, applied: created, revision });
}

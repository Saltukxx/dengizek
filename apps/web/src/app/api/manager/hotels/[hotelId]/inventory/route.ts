// ---------------------------------------------------------------------------
// GET/PUT /api/manager/hotels/[hotelId]/inventory — günlük oda envanteri
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { roomInventoryTable } from "@/lib/db/schema";
import { inventoryPutSchema } from "@/lib/schemas/hotel-panel";
import { logAudit } from "@/lib/audit";
import { assertRoomsBelongToHotel } from "@/lib/tenant-integrity";
import { expectedRevisionRequiredResponse, getPanelRevision, panelRevisionConflictResponse, readExpectedRevision, runPanelMutation } from "@/lib/panel-revision";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function GET(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const roomId = url.searchParams.get("roomId");

  const db = getDb();
  const filters = [eq(roomInventoryTable.hotelId, guard.hotel.id)];
  if (from) filters.push(gte(roomInventoryTable.date, from));
  if (to) filters.push(lte(roomInventoryTable.date, to));
  if (roomId) filters.push(eq(roomInventoryTable.roomId, roomId));

  const inventory = await db
    .select()
    .from(roomInventoryTable)
    .where(and(...filters))
    .orderBy(asc(roomInventoryTable.date));

  const revision = await getPanelRevision(db, guard.hotel.id, "inventory");
  return NextResponse.json({ ok: true, inventory, revision: revision.revision });
}

export async function PUT(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const expectedRevision = readExpectedRevision(body);
  if (!expectedRevision) return expectedRevisionRequiredResponse();
  const parsed = inventoryPutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (!(await assertRoomsBelongToHotel(guard.hotel.id, parsed.data.entries.map((e) => e.roomId)))) {
    return NextResponse.json({ ok: false, error: "Oda bulunamadı." }, { status: 404 });
  }
  // Aynı oda+gece iki kez gelirse sonuncusu geçerli: çok satırlı upsert aynı
  // satıra iki kez dokunamaz.
  const unique = new Map<string, (typeof parsed.data.entries)[number]>();
  for (const entry of parsed.data.entries) unique.set(`${entry.roomId}:${entry.date}`, entry);
  const rows = [...unique.values()].map((entry) => ({
    ...entry,
    minStay: entry.minStay ?? null,
    hotelId: guard.hotel.id,
    source: "manual",
    manualOverride: true,
  }));

  let revision: number;
  try {
    const mutation = await runPanelMutation({
      hotelId: guard.hotel.id, scope: "inventory", expectedRevision, updatedBy: guard.user.id,
      mutate: async (tx) => {
        for (let i = 0; i < rows.length; i += 250) {
          await tx.insert(roomInventoryTable).values(rows.slice(i, i + 250))
            .onConflictDoUpdate({
              target: [roomInventoryTable.roomId, roomInventoryTable.date],
              set: {
                allotment: sql`excluded.allotment`, stopSell: sql`excluded.stop_sell`,
                minStay: sql`excluded.min_stay`, cta: sql`excluded.cta`, ctd: sql`excluded.ctd`,
                source: "manual", manualOverride: true,
              },
            });
        }
      },
    });
    revision = mutation.revision;
  } catch (error) { const conflict = panelRevisionConflictResponse(error); if (conflict) return conflict; throw error; }

  await logAudit({
    actor: guard.user,
    action: "envanter.guncellendi",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { kayit: parsed.data.entries.length },
  });

  return NextResponse.json({ ok: true, count: parsed.data.entries.length, revision });
}

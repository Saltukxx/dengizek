// ---------------------------------------------------------------------------
// GET/POST /api/manager/hotels/[hotelId]/extras
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { extrasTable } from "@/lib/db/schema";
import { extraUpsertSchema } from "@/lib/schemas/hotel-content";
import { logAudit } from "@/lib/audit";
import { expectedRevisionRequiredResponse, getPanelRevision, panelRevisionConflictResponse, readExpectedRevision, runPanelMutation } from "@/lib/panel-revision";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const db = getDb();
  const extras = await db
    .select()
    .from(extrasTable)
    .where(eq(extrasTable.hotelId, guard.hotel.id))
    .orderBy(asc(extrasTable.orderIndex), asc(extrasTable.createdAt));

  const revision = await getPanelRevision(db, guard.hotel.id, "extras");
  return NextResponse.json({ ok: true, extras, revision: revision.revision });
}

export async function POST(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const expectedRevision = readExpectedRevision(body);
  if (!expectedRevision) return expectedRevisionRequiredResponse();
  const parsed = extraUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const { result: extra, revision } = await runPanelMutation({
      hotelId: guard.hotel.id, scope: "extras", expectedRevision, updatedBy: guard.user.id,
      mutate: async (tx) => {
        const existing = await tx.select({ orderIndex: extrasTable.orderIndex })
          .from(extrasTable).where(eq(extrasTable.hotelId, guard.hotel.id));
        const nextOrder = existing.reduce((max, r) => Math.max(max, r.orderIndex + 1), 0);
        const [created] = await tx.insert(extrasTable).values({
          ...parsed.data, imageUrl: parsed.data.imageUrl || null,
          hotelId: guard.hotel.id, orderIndex: nextOrder,
        }).returning();
        return created;
      },
    });

    await logAudit({
    actor: guard.user,
    action: "ekstra.olusturuldu",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { name: extra.name, category: extra.category },
  });

    return NextResponse.json({ ok: true, extra, revision }, { status: 201 });
  } catch (error) {
    const conflict = panelRevisionConflictResponse(error);
    if (conflict) return conflict;
    throw error;
  }
}

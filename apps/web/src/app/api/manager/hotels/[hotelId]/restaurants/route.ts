// ---------------------------------------------------------------------------
// GET/POST /api/manager/hotels/[hotelId]/restaurants
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { restaurantsTable } from "@/lib/db/schema";
import { restaurantUpsertSchema } from "@/lib/schemas/hotel-content";
import { logAudit } from "@/lib/audit";
import { expectedRevisionRequiredResponse, getPanelRevision, panelRevisionConflictResponse, readExpectedRevision, runPanelMutation } from "@/lib/panel-revision";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const db = getDb();
  const restaurants = await db
    .select()
    .from(restaurantsTable)
    .where(eq(restaurantsTable.hotelId, guard.hotel.id))
    .orderBy(asc(restaurantsTable.orderIndex), asc(restaurantsTable.createdAt));

  const revision = await getPanelRevision(db, guard.hotel.id, "restaurants");
  return NextResponse.json({ ok: true, restaurants, revision: revision.revision });
}

export async function POST(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const expectedRevision = readExpectedRevision(body);
  if (!expectedRevision) return expectedRevisionRequiredResponse();
  const parsed = restaurantUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const { result: restaurant, revision } = await runPanelMutation({
      hotelId: guard.hotel.id, scope: "restaurants", expectedRevision, updatedBy: guard.user.id,
      mutate: async (tx) => {
        const existing = await tx.select({ orderIndex: restaurantsTable.orderIndex })
          .from(restaurantsTable).where(eq(restaurantsTable.hotelId, guard.hotel.id));
        const nextOrder = existing.reduce((max, r) => Math.max(max, r.orderIndex + 1), 0);
        const [created] = await tx.insert(restaurantsTable).values({
          ...parsed.data, imageUrl: parsed.data.imageUrl || null,
          hotelId: guard.hotel.id, orderIndex: nextOrder,
        }).returning();
        return created;
      },
    });

    await logAudit({
    actor: guard.user,
    action: "restoran.olusturuldu",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { name: restaurant.name },
  });

    return NextResponse.json({ ok: true, restaurant, revision }, { status: 201 });
  } catch (error) {
    const conflict = panelRevisionConflictResponse(error);
    if (conflict) return conflict;
    throw error;
  }
}

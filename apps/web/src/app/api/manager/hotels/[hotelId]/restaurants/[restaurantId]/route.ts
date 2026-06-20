// ---------------------------------------------------------------------------
// PATCH/DELETE /api/manager/hotels/[hotelId]/restaurants/[restaurantId]
// PATCH menü dahil tüm restoranı tek atomik UPDATE ile kaydeder (jsonb).
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { restaurantsTable } from "@/lib/db/schema";
import { restaurantUpsertSchema } from "@/lib/schemas/hotel-content";
import { logAudit } from "@/lib/audit";

type RouteParams = { params: Promise<{ hotelId: string; restaurantId: string }> };

async function findRestaurant(hotelId: string, restaurantId: string) {
  const db = getDb();
  const [restaurant] = await db
    .select()
    .from(restaurantsTable)
    .where(
      and(eq(restaurantsTable.hotelId, hotelId), eq(restaurantsTable.id, restaurantId)),
    )
    .limit(1);
  return restaurant;
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { hotelId, restaurantId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = restaurantUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const restaurant = await findRestaurant(guard.hotel.id, restaurantId);
  if (!restaurant) {
    return NextResponse.json({ ok: false, error: "Restoran bulunamadı." }, { status: 404 });
  }

  const db = getDb();
  const [updated] = await db
    .update(restaurantsTable)
    .set({
      ...parsed.data,
      imageUrl: parsed.data.imageUrl || null,
      updatedAt: new Date(),
    })
    .where(eq(restaurantsTable.id, restaurant.id))
    .returning();

  return NextResponse.json({ ok: true, restaurant: updated });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { hotelId, restaurantId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const restaurant = await findRestaurant(guard.hotel.id, restaurantId);
  if (!restaurant) {
    return NextResponse.json({ ok: false, error: "Restoran bulunamadı." }, { status: 404 });
  }

  const db = getDb();
  await db.delete(restaurantsTable).where(eq(restaurantsTable.id, restaurant.id));

  await logAudit({
    actor: guard.user,
    action: "restoran.silindi",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { name: restaurant.name },
  });

  return NextResponse.json({ ok: true });
}

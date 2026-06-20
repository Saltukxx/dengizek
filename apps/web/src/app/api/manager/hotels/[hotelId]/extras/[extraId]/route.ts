// ---------------------------------------------------------------------------
// PATCH/DELETE /api/manager/hotels/[hotelId]/extras/[extraId]
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { extrasTable } from "@/lib/db/schema";
import { extraUpsertSchema } from "@/lib/schemas/hotel-content";
import { logAudit } from "@/lib/audit";

type RouteParams = { params: Promise<{ hotelId: string; extraId: string }> };

async function findExtra(hotelId: string, extraId: string) {
  const db = getDb();
  const [extra] = await db
    .select()
    .from(extrasTable)
    .where(and(eq(extrasTable.hotelId, hotelId), eq(extrasTable.id, extraId)))
    .limit(1);
  return extra;
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { hotelId, extraId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = extraUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const extra = await findExtra(guard.hotel.id, extraId);
  if (!extra) {
    return NextResponse.json({ ok: false, error: "Hizmet bulunamadı." }, { status: 404 });
  }

  const db = getDb();
  const [updated] = await db
    .update(extrasTable)
    .set({
      ...parsed.data,
      imageUrl: parsed.data.imageUrl || null,
      updatedAt: new Date(),
    })
    .where(eq(extrasTable.id, extra.id))
    .returning();

  return NextResponse.json({ ok: true, extra: updated });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { hotelId, extraId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const extra = await findExtra(guard.hotel.id, extraId);
  if (!extra) {
    return NextResponse.json({ ok: false, error: "Hizmet bulunamadı." }, { status: 404 });
  }

  const db = getDb();
  await db.delete(extrasTable).where(eq(extrasTable.id, extra.id));

  await logAudit({
    actor: guard.user,
    action: "ekstra.silindi",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { name: extra.name },
  });

  return NextResponse.json({ ok: true });
}

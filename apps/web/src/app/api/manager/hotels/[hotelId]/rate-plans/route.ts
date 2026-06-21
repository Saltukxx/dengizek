// ---------------------------------------------------------------------------
// GET/POST/PATCH/DELETE /api/manager/hotels/[hotelId]/rate-plans
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { ratePlansTable } from "@/lib/db/schema";
import { ratePlanPatchSchema, ratePlanSchema } from "@/lib/schemas/hotel-panel";
import { logAudit } from "@/lib/audit";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const db = getDb();
  const plans = await db
    .select()
    .from(ratePlansTable)
    .where(eq(ratePlansTable.hotelId, guard.hotel.id))
    .orderBy(asc(ratePlansTable.createdAt));

  return NextResponse.json({ ok: true, plans });
}

export async function POST(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = ratePlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  if (parsed.data.isDefault) {
    await db
      .update(ratePlansTable)
      .set({ isDefault: false })
      .where(eq(ratePlansTable.hotelId, guard.hotel.id));
  }
  const [plan] = await db
    .insert(ratePlansTable)
    .values({ ...parsed.data, hotelId: guard.hotel.id })
    .returning();

  await logAudit({
    actor: guard.user,
    action: "fiyat_plani.olusturuldu",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { planId: plan.id },
  });

  return NextResponse.json({ ok: true, plan }, { status: 201 });
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = ratePlanPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id, ...fields } = parsed.data;
  const db = getDb();
  if (fields.isDefault === true) {
    await db
      .update(ratePlansTable)
      .set({ isDefault: false })
      .where(eq(ratePlansTable.hotelId, guard.hotel.id));
  }
  const [updated] = await db
    .update(ratePlansTable)
    .set(fields)
    .where(and(eq(ratePlansTable.id, id), eq(ratePlansTable.hotelId, guard.hotel.id)))
    .returning();

  if (!updated) {
    return NextResponse.json({ ok: false, error: "Plan bulunamadı." }, { status: 404 });
  }
  await logAudit({
    actor: guard.user,
    action: "fiyat_plani.guncellendi",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { planId: updated.id },
  });
  return NextResponse.json({ ok: true, plan: updated });
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const id = body?.id as string | undefined;
  if (!id) {
    return NextResponse.json({ ok: false, error: "id gerekli." }, { status: 400 });
  }

  const db = getDb();
  await db
    .delete(ratePlansTable)
    .where(and(eq(ratePlansTable.id, id), eq(ratePlansTable.hotelId, guard.hotel.id)));

  await logAudit({
    actor: guard.user,
    action: "fiyat_plani.silindi",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { planId: id },
  });

  return NextResponse.json({ ok: true });
}

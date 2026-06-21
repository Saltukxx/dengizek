// ---------------------------------------------------------------------------
// GET/POST/PATCH/DELETE /api/manager/hotels/[hotelId]/promotions
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { promotionsTable } from "@/lib/db/schema";
import { promotionPatchSchema, promotionSchema } from "@/lib/schemas/hotel-panel";
import { logAudit } from "@/lib/audit";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const db = getDb();
  const promotions = await db
    .select()
    .from(promotionsTable)
    .where(eq(promotionsTable.hotelId, guard.hotel.id))
    .orderBy(asc(promotionsTable.createdAt));

  return NextResponse.json({ ok: true, promotions });
}

export async function POST(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = promotionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const [promotion] = await db
    .insert(promotionsTable)
    .values({ ...parsed.data, hotelId: guard.hotel.id })
    .returning();

  await logAudit({
    actor: guard.user,
    action: "kampanya.olusturuldu",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { promotionId: promotion.id, name: promotion.name },
  });

  return NextResponse.json({ ok: true, promotion }, { status: 201 });
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = promotionPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id, ...fields } = parsed.data;
  const db = getDb();
  const [updated] = await db
    .update(promotionsTable)
    .set(fields)
    .where(and(eq(promotionsTable.id, id), eq(promotionsTable.hotelId, guard.hotel.id)))
    .returning();

  if (!updated) {
    return NextResponse.json({ ok: false, error: "Kampanya bulunamadı." }, { status: 404 });
  }
  await logAudit({
    actor: guard.user,
    action: "kampanya.guncellendi",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { promotionId: updated.id },
  });
  return NextResponse.json({ ok: true, promotion: updated });
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
    .delete(promotionsTable)
    .where(and(eq(promotionsTable.id, id), eq(promotionsTable.hotelId, guard.hotel.id)));

  await logAudit({
    actor: guard.user,
    action: "kampanya.silindi",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { promotionId: id },
  });

  return NextResponse.json({ ok: true });
}

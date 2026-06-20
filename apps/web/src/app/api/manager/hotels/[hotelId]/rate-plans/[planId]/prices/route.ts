// ---------------------------------------------------------------------------
// GET/POST/PATCH/DELETE .../rate-plans/[planId]/prices
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { ratePlansTable, roomRatePlanPricesTable } from "@/lib/db/schema";
import { ratePlanPricePatchSchema, ratePlanPriceSchema } from "@/lib/schemas/hotel-panel";

type RouteParams = { params: Promise<{ hotelId: string; planId: string }> };

async function findPlan(hotelId: string, planId: string) {
  const db = getDb();
  const [plan] = await db
    .select({ id: ratePlansTable.id })
    .from(ratePlansTable)
    .where(and(eq(ratePlansTable.id, planId), eq(ratePlansTable.hotelId, hotelId)))
    .limit(1);
  return plan;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { hotelId, planId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const plan = await findPlan(guard.hotel.id, planId);
  if (!plan) {
    return NextResponse.json({ ok: false, error: "Plan bulunamadı." }, { status: 404 });
  }

  const db = getDb();
  const prices = await db
    .select()
    .from(roomRatePlanPricesTable)
    .where(
      and(
        eq(roomRatePlanPricesTable.ratePlanId, planId),
        eq(roomRatePlanPricesTable.hotelId, guard.hotel.id),
      ),
    )
    .orderBy(asc(roomRatePlanPricesTable.startDate));

  return NextResponse.json({ ok: true, prices });
}

export async function POST(req: Request, { params }: RouteParams) {
  const { hotelId, planId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const plan = await findPlan(guard.hotel.id, planId);
  if (!plan) {
    return NextResponse.json({ ok: false, error: "Plan bulunamadı." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = ratePlanPriceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const [price] = await db
    .insert(roomRatePlanPricesTable)
    .values({
      ...parsed.data,
      ratePlanId: planId,
      hotelId: guard.hotel.id,
    })
    .returning();

  return NextResponse.json({ ok: true, price }, { status: 201 });
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { hotelId, planId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = ratePlanPricePatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id, ...fields } = parsed.data;
  const db = getDb();
  const [updated] = await db
    .update(roomRatePlanPricesTable)
    .set(fields)
    .where(
      and(
        eq(roomRatePlanPricesTable.id, id),
        eq(roomRatePlanPricesTable.ratePlanId, planId),
        eq(roomRatePlanPricesTable.hotelId, guard.hotel.id),
      ),
    )
    .returning();

  if (!updated) {
    return NextResponse.json({ ok: false, error: "Fiyat bulunamadı." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, price: updated });
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const { hotelId, planId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const id = body?.id as string | undefined;
  if (!id) {
    return NextResponse.json({ ok: false, error: "id gerekli." }, { status: 400 });
  }

  const db = getDb();
  await db
    .delete(roomRatePlanPricesTable)
    .where(
      and(
        eq(roomRatePlanPricesTable.id, id),
        eq(roomRatePlanPricesTable.ratePlanId, planId),
        eq(roomRatePlanPricesTable.hotelId, guard.hotel.id),
      ),
    );

  return NextResponse.json({ ok: true });
}

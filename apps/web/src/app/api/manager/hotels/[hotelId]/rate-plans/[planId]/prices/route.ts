// ---------------------------------------------------------------------------
// GET/POST/PATCH/DELETE .../rate-plans/[planId]/prices
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { ratePlansTable, roomRatePlanPricesTable } from "@/lib/db/schema";
import { ratePlanPricePatchSchema, ratePlanPriceSchema } from "@/lib/schemas/hotel-panel";
import { assertRoomsBelongToHotel } from "@/lib/tenant-integrity";
import { abortPanelMutation, expectedRevisionRequiredResponse, getPanelRevision, panelRevisionConflictResponse, readExpectedRevision, runPanelMutation } from "@/lib/panel-revision";

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

  const revision = await getPanelRevision(db, guard.hotel.id, "rate_plans");
  return NextResponse.json({ ok: true, prices, revision: revision.revision });
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
  const expectedRevision = readExpectedRevision(body);
  if (!expectedRevision) return expectedRevisionRequiredResponse();
  const parsed = ratePlanPriceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (!(await assertRoomsBelongToHotel(guard.hotel.id, [parsed.data.roomId]))) {
    return NextResponse.json({ ok: false, error: "Oda bulunamadı." }, { status: 404 });
  }

  try {
    const { result: price, revision } = await runPanelMutation({
      hotelId: guard.hotel.id, scope: "rate_plans", expectedRevision, updatedBy: guard.user.id,
      mutate: async (tx) => { const [row] = await tx.insert(roomRatePlanPricesTable).values({
        ...parsed.data, ratePlanId: planId, hotelId: guard.hotel.id,
      }).returning(); return row; },
    });
    return NextResponse.json({ ok: true, price, revision }, { status: 201 });
  } catch (error) { const conflict = panelRevisionConflictResponse(error); if (conflict) return conflict; throw error; }
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { hotelId, planId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const expectedRevision = readExpectedRevision(body);
  if (!expectedRevision) return expectedRevisionRequiredResponse();
  const parsed = ratePlanPricePatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (!(await assertRoomsBelongToHotel(guard.hotel.id, [parsed.data.roomId]))) {
    return NextResponse.json({ ok: false, error: "Oda bulunamadı." }, { status: 404 });
  }

  const { id, ...fields } = parsed.data;
  let updated: typeof roomRatePlanPricesTable.$inferSelect | undefined;
  let revision: number;
  try {
    const mutation = await runPanelMutation({
      hotelId: guard.hotel.id, scope: "rate_plans", expectedRevision, updatedBy: guard.user.id,
      mutate: async (tx) => { const [row] = await tx.update(roomRatePlanPricesTable).set(fields).where(and(
        eq(roomRatePlanPricesTable.id, id), eq(roomRatePlanPricesTable.ratePlanId, planId),
        eq(roomRatePlanPricesTable.hotelId, guard.hotel.id),
      )).returning(); if (!row) abortPanelMutation("Fiyat bulunamadı."); return row; },
    });
    updated = mutation.result; revision = mutation.revision;
  } catch (error) { const conflict = panelRevisionConflictResponse(error); if (conflict) return conflict; throw error; }

  if (!updated) {
    return NextResponse.json({ ok: false, error: "Fiyat bulunamadı." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, price: updated, revision });
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const { hotelId, planId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const expectedRevision = readExpectedRevision(body);
  if (!expectedRevision) return expectedRevisionRequiredResponse();
  const id = body?.id as string | undefined;
  if (!id) {
    return NextResponse.json({ ok: false, error: "id gerekli." }, { status: 400 });
  }

  try {
    const { revision } = await runPanelMutation({
      hotelId: guard.hotel.id, scope: "rate_plans", expectedRevision, updatedBy: guard.user.id,
      mutate: async (tx) => { await tx.delete(roomRatePlanPricesTable).where(and(
        eq(roomRatePlanPricesTable.id, id), eq(roomRatePlanPricesTable.ratePlanId, planId),
        eq(roomRatePlanPricesTable.hotelId, guard.hotel.id),
      )); },
    });
    return NextResponse.json({ ok: true, revision });
  } catch (error) { const conflict = panelRevisionConflictResponse(error); if (conflict) return conflict; throw error; }
}

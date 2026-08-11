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
import { assertCancellationRuleBelongsToHotel } from "@/lib/tenant-integrity";
import { abortPanelMutation, expectedRevisionRequiredResponse, getPanelRevision, panelRevisionConflictResponse, readExpectedRevision, runPanelMutation } from "@/lib/panel-revision";

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

  const revision = await getPanelRevision(db, guard.hotel.id, "rate_plans");
  return NextResponse.json({ ok: true, plans, revision: revision.revision });
}

export async function POST(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const expectedRevision = readExpectedRevision(body);
  if (!expectedRevision) return expectedRevisionRequiredResponse();
  const parsed = ratePlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (!(await assertCancellationRuleBelongsToHotel(guard.hotel.id, parsed.data.cancellationRuleId))) {
    return NextResponse.json({ ok: false, error: "İptal kuralı bulunamadı." }, { status: 404 });
  }

  let plan: typeof ratePlansTable.$inferSelect;
  let revision: number;
  try {
    const mutation = await runPanelMutation({
      hotelId: guard.hotel.id, scope: "rate_plans", expectedRevision, updatedBy: guard.user.id,
      mutate: async (tx) => {
        const existing = await tx.select({ id: ratePlansTable.id }).from(ratePlansTable)
          .where(eq(ratePlansTable.hotelId, guard.hotel.id));
        const makeDefault = parsed.data.isDefault || existing.length === 0;
        if (makeDefault) await tx.update(ratePlansTable).set({ isDefault: false })
          .where(eq(ratePlansTable.hotelId, guard.hotel.id));
        const [created] = await tx.insert(ratePlansTable).values({
          ...parsed.data, isDefault: makeDefault, hotelId: guard.hotel.id,
        }).returning();
        return created;
      },
    });
    plan = mutation.result; revision = mutation.revision;
  } catch (error) { const conflict = panelRevisionConflictResponse(error); if (conflict) return conflict; throw error; }

  await logAudit({
    actor: guard.user,
    action: "fiyat_plani.olusturuldu",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { planId: plan.id },
  });

  return NextResponse.json({ ok: true, plan, revision }, { status: 201 });
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const expectedRevision = readExpectedRevision(body);
  if (!expectedRevision) return expectedRevisionRequiredResponse();
  const parsed = ratePlanPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (!(await assertCancellationRuleBelongsToHotel(guard.hotel.id, parsed.data.cancellationRuleId))) {
    return NextResponse.json({ ok: false, error: "İptal kuralı bulunamadı." }, { status: 404 });
  }

  const { id, ...fields } = parsed.data;
  if (fields.isDefault === false) {
    const [current] = await getDb().select({ isDefault: ratePlansTable.isDefault }).from(ratePlansTable).where(and(eq(ratePlansTable.id, id), eq(ratePlansTable.hotelId, guard.hotel.id))).limit(1);
    if (current?.isDefault) return NextResponse.json({ ok: false, error: "Varsayılan plan kapatılamaz; önce başka bir planı varsayılan yapın." }, { status: 409 });
  }
  let updated: typeof ratePlansTable.$inferSelect | undefined;
  let revision: number;
  try {
    const mutation = await runPanelMutation({
      hotelId: guard.hotel.id, scope: "rate_plans", expectedRevision, updatedBy: guard.user.id,
      mutate: async (tx) => {
        if (fields.isDefault === true) await tx.update(ratePlansTable).set({ isDefault: false })
          .where(eq(ratePlansTable.hotelId, guard.hotel.id));
        const [row] = await tx.update(ratePlansTable).set(fields)
          .where(and(eq(ratePlansTable.id, id), eq(ratePlansTable.hotelId, guard.hotel.id))).returning();
        if (!row) abortPanelMutation("Plan bulunamadı.");
        return row;
      },
    });
    updated = mutation.result; revision = mutation.revision;
  } catch (error) { const conflict = panelRevisionConflictResponse(error); if (conflict) return conflict; throw error; }

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
  return NextResponse.json({ ok: true, plan: updated, revision });
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const expectedRevision = readExpectedRevision(body);
  if (!expectedRevision) return expectedRevisionRequiredResponse();
  const id = body?.id as string | undefined;
  if (!id) {
    return NextResponse.json({ ok: false, error: "id gerekli." }, { status: 400 });
  }

  const db = getDb();
  const [target] = await db.select({ isDefault: ratePlansTable.isDefault }).from(ratePlansTable).where(and(eq(ratePlansTable.id, id), eq(ratePlansTable.hotelId, guard.hotel.id))).limit(1);
  if (!target) return NextResponse.json({ ok: false, error: "Plan bulunamadı." }, { status: 404 });
  if (target.isDefault) return NextResponse.json({ ok: false, error: "Varsayılan plan silinemez; önce başka bir planı varsayılan yapın." }, { status: 409 });
  let revision: number;
  try {
    const mutation = await runPanelMutation({
      hotelId: guard.hotel.id, scope: "rate_plans", expectedRevision, updatedBy: guard.user.id,
      mutate: async (tx) => { await tx.delete(ratePlansTable)
        .where(and(eq(ratePlansTable.id, id), eq(ratePlansTable.hotelId, guard.hotel.id))); },
    });
    revision = mutation.revision;
  } catch (error) { const conflict = panelRevisionConflictResponse(error); if (conflict) return conflict; throw error; }

  await logAudit({
    actor: guard.user,
    action: "fiyat_plani.silindi",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { planId: id },
  });

  return NextResponse.json({ ok: true, revision });
}

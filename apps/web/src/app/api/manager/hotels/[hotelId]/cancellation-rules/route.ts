// ---------------------------------------------------------------------------
// GET/POST/PATCH/DELETE /api/manager/hotels/[hotelId]/cancellation-rules
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { cancellationRulesTable } from "@/lib/db/schema";
import { cancellationRulePatchSchema, cancellationRuleSchema } from "@/lib/schemas/hotel-panel";
import { logAudit } from "@/lib/audit";
import { abortPanelMutation, expectedRevisionRequiredResponse, getPanelRevision, panelRevisionConflictResponse, readExpectedRevision, runPanelMutation } from "@/lib/panel-revision";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const db = getDb();
  const rules = await db
    .select()
    .from(cancellationRulesTable)
    .where(eq(cancellationRulesTable.hotelId, guard.hotel.id))
    .orderBy(asc(cancellationRulesTable.createdAt));

  const revision = await getPanelRevision(db, guard.hotel.id, "cancellation_rules");
  return NextResponse.json({ ok: true, rules, revision: revision.revision });
}

export async function POST(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const expectedRevision = readExpectedRevision(body);
  if (!expectedRevision) return expectedRevisionRequiredResponse();
  const parsed = cancellationRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let rule: typeof cancellationRulesTable.$inferSelect;
  let revision: number;
  try {
    const mutation = await runPanelMutation({
      hotelId: guard.hotel.id, scope: "cancellation_rules", expectedRevision, updatedBy: guard.user.id,
      mutate: async (tx) => { const [row] = await tx.insert(cancellationRulesTable)
        .values({ ...parsed.data, hotelId: guard.hotel.id }).returning(); return row; },
    });
    rule = mutation.result; revision = mutation.revision;
  } catch (error) { const conflict = panelRevisionConflictResponse(error); if (conflict) return conflict; throw error; }

  await logAudit({
    actor: guard.user,
    action: "iptal_kurali.olusturuldu",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { ruleId: rule.id },
  });

  return NextResponse.json({ ok: true, rule, revision }, { status: 201 });
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const expectedRevision = readExpectedRevision(body);
  if (!expectedRevision) return expectedRevisionRequiredResponse();
  const parsed = cancellationRulePatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id, ...fields } = parsed.data;
  let updated: typeof cancellationRulesTable.$inferSelect | undefined;
  let revision: number;
  try {
    const mutation = await runPanelMutation({
      hotelId: guard.hotel.id, scope: "cancellation_rules", expectedRevision, updatedBy: guard.user.id,
      mutate: async (tx) => { const [row] = await tx.update(cancellationRulesTable).set(fields).where(and(
        eq(cancellationRulesTable.id, id), eq(cancellationRulesTable.hotelId, guard.hotel.id),
      )).returning(); if (!row) abortPanelMutation("Kural bulunamadı."); return row; },
    });
    updated = mutation.result; revision = mutation.revision;
  } catch (error) { const conflict = panelRevisionConflictResponse(error); if (conflict) return conflict; throw error; }

  if (!updated) {
    return NextResponse.json({ ok: false, error: "Kural bulunamadı." }, { status: 404 });
  }
  await logAudit({
    actor: guard.user,
    action: "iptal_kurali.guncellendi",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { ruleId: updated.id },
  });
  return NextResponse.json({ ok: true, rule: updated, revision });
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

  let revision: number;
  try {
    const mutation = await runPanelMutation({
      hotelId: guard.hotel.id, scope: "cancellation_rules", expectedRevision, updatedBy: guard.user.id,
      mutate: async (tx) => { await tx.delete(cancellationRulesTable).where(and(
        eq(cancellationRulesTable.id, id), eq(cancellationRulesTable.hotelId, guard.hotel.id),
      )); },
    });
    revision = mutation.revision;
  } catch (error) { const conflict = panelRevisionConflictResponse(error); if (conflict) return conflict; throw error; }

  await logAudit({
    actor: guard.user,
    action: "iptal_kurali.silindi",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { ruleId: id },
  });

  return NextResponse.json({ ok: true, revision });
}

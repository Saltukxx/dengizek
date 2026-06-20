// ---------------------------------------------------------------------------
// GET/POST/PATCH/DELETE /api/manager/hotels/[hotelId]/cancellation-rules
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { cancellationRulesTable } from "@/lib/db/schema";
import { cancellationRulePatchSchema, cancellationRuleSchema } from "@/lib/schemas/hotel-panel";

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

  return NextResponse.json({ ok: true, rules });
}

export async function POST(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = cancellationRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const [rule] = await db
    .insert(cancellationRulesTable)
    .values({ ...parsed.data, hotelId: guard.hotel.id })
    .returning();

  return NextResponse.json({ ok: true, rule }, { status: 201 });
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = cancellationRulePatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id, ...fields } = parsed.data;
  const db = getDb();
  const [updated] = await db
    .update(cancellationRulesTable)
    .set(fields)
    .where(
      and(eq(cancellationRulesTable.id, id), eq(cancellationRulesTable.hotelId, guard.hotel.id)),
    )
    .returning();

  if (!updated) {
    return NextResponse.json({ ok: false, error: "Kural bulunamadı." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, rule: updated });
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
    .delete(cancellationRulesTable)
    .where(
      and(eq(cancellationRulesTable.id, id), eq(cancellationRulesTable.hotelId, guard.hotel.id)),
    );

  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// GET/POST /api/manager/hotels/[hotelId]/extras
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { extrasTable } from "@/lib/db/schema";
import { extraUpsertSchema } from "@/lib/schemas/hotel-content";
import { logAudit } from "@/lib/audit";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const db = getDb();
  const extras = await db
    .select()
    .from(extrasTable)
    .where(eq(extrasTable.hotelId, guard.hotel.id))
    .orderBy(asc(extrasTable.orderIndex), asc(extrasTable.createdAt));

  return NextResponse.json({ ok: true, extras });
}

export async function POST(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
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

  const db = getDb();
  const existing = await db
    .select({ orderIndex: extrasTable.orderIndex })
    .from(extrasTable)
    .where(eq(extrasTable.hotelId, guard.hotel.id));
  const nextOrder = existing.reduce((max, r) => Math.max(max, r.orderIndex + 1), 0);

  const [extra] = await db
    .insert(extrasTable)
    .values({
      ...parsed.data,
      imageUrl: parsed.data.imageUrl || null,
      hotelId: guard.hotel.id,
      orderIndex: nextOrder,
    })
    .returning();

  await logAudit({
    actor: guard.user,
    action: "ekstra.olusturuldu",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { name: extra.name, category: extra.category },
  });

  return NextResponse.json({ ok: true, extra }, { status: 201 });
}

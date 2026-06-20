// ---------------------------------------------------------------------------
// GET/POST/PATCH/DELETE /api/manager/hotels/[hotelId]/availability-notes
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { hotelAvailabilityNotesTable } from "@/lib/db/schema";
import { availabilityNotePatchSchema, availabilityNoteSchema } from "@/lib/schemas/hotel-panel";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const db = getDb();
  const notes = await db
    .select()
    .from(hotelAvailabilityNotesTable)
    .where(eq(hotelAvailabilityNotesTable.hotelId, guard.hotel.id))
    .orderBy(asc(hotelAvailabilityNotesTable.startDate));

  return NextResponse.json({ ok: true, notes });
}

export async function POST(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = availabilityNoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const [note] = await db
    .insert(hotelAvailabilityNotesTable)
    .values({
      hotelId: guard.hotel.id,
      label: parsed.data.label,
      startDate: parsed.data.startDate ?? null,
      endDate: parsed.data.endDate ?? null,
      isBlackout: parsed.data.isBlackout,
    })
    .returning();

  return NextResponse.json({ ok: true, note }, { status: 201 });
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = availabilityNotePatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id, ...fields } = parsed.data;
  const db = getDb();
  const [updated] = await db
    .update(hotelAvailabilityNotesTable)
    .set(fields)
    .where(
      and(
        eq(hotelAvailabilityNotesTable.id, id),
        eq(hotelAvailabilityNotesTable.hotelId, guard.hotel.id),
      ),
    )
    .returning();

  if (!updated) {
    return NextResponse.json({ ok: false, error: "Not bulunamadı." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, note: updated });
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
    .delete(hotelAvailabilityNotesTable)
    .where(
      and(
        eq(hotelAvailabilityNotesTable.id, id),
        eq(hotelAvailabilityNotesTable.hotelId, guard.hotel.id),
      ),
    );

  return NextResponse.json({ ok: true });
}

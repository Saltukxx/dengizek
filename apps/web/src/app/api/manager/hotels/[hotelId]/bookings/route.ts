// ---------------------------------------------------------------------------
// GET/POST/PATCH /api/manager/hotels/[hotelId]/bookings
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { bookingsTable } from "@/lib/db/schema";
import { bookingCreateSchema, bookingPatchSchema } from "@/lib/schemas/hotel-panel";
import {
  adjustInventoryForBooking,
  assertInventoryAvailable,
  findOverlappingBooking,
} from "@/lib/bookings";
import { logAudit } from "@/lib/audit";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function GET(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const url = new URL(req.url);
  const status = url.searchParams.get("durum");

  const db = getDb();
  const filters = [eq(bookingsTable.hotelId, guard.hotel.id)];
  if (status && ["beklemede", "onaylandi", "iptal", "no_show"].includes(status)) {
    filters.push(eq(bookingsTable.status, status as "beklemede" | "onaylandi" | "iptal" | "no_show"));
  }

  const bookings = await db
    .select()
    .from(bookingsTable)
    .where(and(...filters))
    .orderBy(desc(bookingsTable.createdAt));

  return NextResponse.json({ ok: true, bookings });
}

export async function POST(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = bookingCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const overlap = await findOverlappingBooking(
    db,
    guard.hotel.id,
    parsed.data.roomId,
    parsed.data.checkIn,
    parsed.data.checkOut,
  );
  if (overlap) {
    return NextResponse.json(
      { ok: false, error: "Bu tarihlerde çakışan bir rezervasyon var." },
      { status: 409 },
    );
  }

  const [booking] = await db
    .insert(bookingsTable)
    .values({ ...parsed.data, hotelId: guard.hotel.id, status: "beklemede" })
    .returning();

  return NextResponse.json({ ok: true, booking }, { status: 201 });
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = bookingPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id, ...fields } = parsed.data;
  const db = getDb();

  const [existing] = await db
    .select()
    .from(bookingsTable)
    .where(and(eq(bookingsTable.id, id), eq(bookingsTable.hotelId, guard.hotel.id)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ ok: false, error: "Rezervasyon bulunamadı." }, { status: 404 });
  }

  if (fields.status === "onaylandi" && existing.status !== "onaylandi") {
    const overlap = await findOverlappingBooking(
      db,
      guard.hotel.id,
      existing.roomId,
      String(existing.checkIn),
      String(existing.checkOut),
      existing.id,
    );
    if (overlap) {
      return NextResponse.json(
        { ok: false, error: "Onaylanamaz: tarih çakışması var." },
        { status: 409 },
      );
    }

    const inv = await assertInventoryAvailable(
      db,
      existing.roomId,
      String(existing.checkIn),
      String(existing.checkOut),
    );
    if (!inv.ok) {
      return NextResponse.json({ ok: false, error: inv.error }, { status: 409 });
    }

    await adjustInventoryForBooking(
      db,
      guard.hotel.id,
      existing.roomId,
      String(existing.checkIn),
      String(existing.checkOut),
      -1,
    );
  }

  if (
    (fields.status === "iptal" || fields.status === "no_show") &&
    existing.status === "onaylandi"
  ) {
    await adjustInventoryForBooking(
      db,
      guard.hotel.id,
      existing.roomId,
      String(existing.checkIn),
      String(existing.checkOut),
      1,
    );
  }

  const [updated] = await db
    .update(bookingsTable)
    .set({ ...fields, updatedAt: new Date() })
    .where(and(eq(bookingsTable.id, id), eq(bookingsTable.hotelId, guard.hotel.id)))
    .returning();

  if (fields.status) {
    await logAudit({
      actor: guard.user,
      action: `rezervasyon.${fields.status}`,
      entityType: "hotel",
      entityId: id,
      meta: { hotelId: guard.hotel.id },
    });
  }

  return NextResponse.json({ ok: true, booking: updated });
}

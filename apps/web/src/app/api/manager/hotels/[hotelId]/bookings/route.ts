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
  approveBooking,
  BookingServiceError,
  createPendingBooking,
  releaseApprovedBooking,
} from "@/lib/bookings";
import { logAudit } from "@/lib/audit";
import { parsePagination, paginatedQuery } from "@/lib/pagination";
import { apiFail, apiOk } from "@/lib/api-response";

type RouteParams = { params: Promise<{ hotelId: string }> };

function bookingErrorResponse(err: BookingServiceError) {
  const status =
    err.code === "not_found" ? 404 : err.code === "invalid_state" ? 400 : 409;
  return apiFail(err.message, status);
}

export async function GET(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const url = new URL(req.url);
  const status = url.searchParams.get("durum");
  const pagination = parsePagination(url);

  const db = getDb();
  const filters = [eq(bookingsTable.hotelId, guard.hotel.id)];
  if (status && ["beklemede", "onaylandi", "iptal", "no_show"].includes(status)) {
    filters.push(eq(bookingsTable.status, status as "beklemede" | "onaylandi" | "iptal" | "no_show"));
  }

  const where = and(...filters);
  const result = await paginatedQuery({
    db,
    table: bookingsTable,
    where,
    orderBy: desc(bookingsTable.createdAt),
    pagination,
  });

  return NextResponse.json({
    ok: true,
    bookings: result.items,
    sayfa: result.sayfa,
    limit: result.limit,
    totalCount: result.totalCount,
    hasMore: result.hasMore,
  });
}

export async function POST(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = bookingCreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiFail("Doğrulama başarısız", 400, { issues: parsed.error.flatten() });
  }

  try {
    const booking = await createPendingBooking(guard.hotel.id, parsed.data);
    return apiOk({ booking }, 201);
  } catch (err) {
    if (err instanceof BookingServiceError && err.code === "overlap") {
      return apiFail(err.message, 409);
    }
    throw err;
  }
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = bookingPatchSchema.safeParse(body);
  if (!parsed.success) {
    return apiFail("Doğrulama başarısız", 400, { issues: parsed.error.flatten() });
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

  try {
    if (fields.status === "onaylandi" && existing.status !== "onaylandi") {
      const updated = await approveBooking(guard.hotel.id, id);
      await logAudit({
        actor: guard.user,
        action: "rezervasyon.onaylandi",
        entityType: "hotel",
        entityId: id,
        meta: { hotelId: guard.hotel.id },
      });
      return NextResponse.json({ ok: true, booking: updated });
    }

    if (
      (fields.status === "iptal" || fields.status === "no_show") &&
      existing.status === "onaylandi"
    ) {
      const updated = await releaseApprovedBooking(guard.hotel.id, id, fields.status);
      await logAudit({
        actor: guard.user,
        action: `rezervasyon.${fields.status}`,
        entityType: "hotel",
        entityId: id,
        meta: { hotelId: guard.hotel.id },
      });
      return NextResponse.json({ ok: true, booking: updated });
    }
  } catch (err) {
    if (err instanceof BookingServiceError) {
      return bookingErrorResponse(err);
    }
    throw err;
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

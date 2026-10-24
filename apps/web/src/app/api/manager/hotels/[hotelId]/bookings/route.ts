// ---------------------------------------------------------------------------
// GET/POST/PATCH /api/manager/hotels/[hotelId]/bookings
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { bookingsTable, inquiriesTable, paymentsTable } from "@/lib/db/schema";
import { bookingCreateSchema, bookingPatchSchema } from "@/lib/schemas/hotel-panel";
import {
  approveBooking,
  BookingServiceError,
  createPendingBooking,
  recordStayStep,
  releaseApprovedBooking,
  reopenBooking,
} from "@/lib/bookings";
import { bookingListWhere } from "@/lib/booking-filters";
import { bookingForManager } from "@/lib/manager-privacy";
import { logAudit } from "@/lib/audit";
import { parsePagination, paginatedQuery } from "@/lib/pagination";
import { apiFail, apiOk } from "@/lib/api-response";
import { assertRatePlanBelongsToHotel, assertRoomsBelongToHotel } from "@/lib/tenant-integrity";

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
  const pagination = parsePagination(url);

  const db = getDb();
  const where = bookingListWhere(guard.hotel.id, url.searchParams);
  const result = await paginatedQuery({
    db,
    table: bookingsTable,
    where,
    orderBy: desc(bookingsTable.createdAt),
    pagination,
  });

  return NextResponse.json({
    ok: true,
    bookings: (result.items as (typeof bookingsTable.$inferSelect)[]).map(bookingForManager),
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
  const refsValid = await Promise.all([
    assertRoomsBelongToHotel(guard.hotel.id, [parsed.data.roomId]),
    assertRatePlanBelongsToHotel(guard.hotel.id, parsed.data.ratePlanId),
  ]);
  if (refsValid.some((ok) => !ok)) return apiFail("İlişkili kayıt bulunamadı.", 404);

  // Rezervasyon yalnız bu tesise gelmiş bir Otelsayfam talebinden açılır; misafir
  // bilgisi istemciden değil talep kaydından alınır.
  const [inquiry] = await getDb()
    .select({
      id: inquiriesTable.id,
      name: inquiriesTable.name,
      email: inquiriesTable.email,
    })
    .from(inquiriesTable)
    .where(and(eq(inquiriesTable.id, parsed.data.inquiryId), eq(inquiriesTable.hotelId, guard.hotel.id)))
    .limit(1);
  if (!inquiry) return apiFail("Rezervasyon yalnız Otelsayfam üzerinden gelen bir talepten açılabilir.", 404);

  try {
    const booking = await createPendingBooking(guard.hotel.id, {
      ...parsed.data,
      guestName: inquiry.name,
      guestEmail: inquiry.email,
      guestPhone: null,
    });
    return apiOk({ booking: bookingForManager(booking) }, 201);
  } catch (err) {
    // overlap → 409, kapasite/geçersiz durum → 400, oda yok → 404
    if (err instanceof BookingServiceError) {
      return bookingErrorResponse(err);
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

  const { id, action, idempotencyKey, ...fields } = parsed.data;
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
    if (action === "approve") {
      const updated = await approveBooking(guard.hotel.id, id, idempotencyKey!);
      await logAudit({
        actor: guard.user,
        action: "rezervasyon.onaylandi",
        entityType: "hotel",
        entityId: id,
        meta: { hotelId: guard.hotel.id },
      });
      return NextResponse.json({ ok: true, booking: updated ? bookingForManager(updated) : null });
    }

    if (action === "cancel" || action === "mark_no_show") {
      const nextStatus = action === "cancel" ? "iptal" : "no_show";
      const updated = await releaseApprovedBooking(guard.hotel.id, id, nextStatus, idempotencyKey!);
      await logAudit({
        actor: guard.user,
        action: `rezervasyon.${nextStatus}`,
        entityType: "hotel",
        entityId: id,
        meta: { hotelId: guard.hotel.id },
      });
      return NextResponse.json({ ok: true, booking: updated ? bookingForManager(updated) : null });
    }
    if (
      action === "check_in" ||
      action === "check_out" ||
      action === "undo_check_in" ||
      action === "undo_check_out"
    ) {
      const updated = await recordStayStep(guard.hotel.id, id, action, idempotencyKey!);
      await logAudit({
        actor: guard.user,
        action: `rezervasyon.${action.replace(/_/g, "-")}`,
        entityType: "hotel",
        entityId: id,
        meta: { hotelId: guard.hotel.id },
      });
      return NextResponse.json({ ok: true, booking: updated ? bookingForManager(updated) : null });
    }
    if (action === "reopen") {
      const updated = await reopenBooking(guard.hotel.id, id, idempotencyKey!);
      return NextResponse.json({ ok: true, booking: updated ? bookingForManager(updated) : null });
    }
  } catch (err) {
    if (err instanceof BookingServiceError) {
      return bookingErrorResponse(err);
    }
    throw err;
  }

  // Tutar kilidi: açık/tahsil edilmiş ödeme varken totalMinor değiştirilemez —
  // aksi halde tahsil edilen tutar ile rezervasyon tutarı sessizce ayrışır.
  if (fields.totalMinor !== undefined && fields.totalMinor !== existing.totalMinor) {
    const livePayments = await db
      .select({ id: paymentsTable.id })
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.bookingId, id),
          inArray(paymentsTable.status, ["odendi", "beklemede"]),
        ),
      )
      .limit(1);
    if (livePayments.length > 0) {
      return apiFail(
        "Bu rezervasyona bağlı açık veya tahsil edilmiş ödeme var — tutar değiştirilemez.",
        409,
      );
    }
  }

  const [updated] = await db
    .update(bookingsTable)
    .set({ ...fields, updatedAt: new Date() })
    .where(and(eq(bookingsTable.id, id), eq(bookingsTable.hotelId, guard.hotel.id)))
    .returning();

  return NextResponse.json({ ok: true, booking: updated ? bookingForManager(updated) : null });
}

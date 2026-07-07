// ---------------------------------------------------------------------------
// GET/POST/PATCH /api/manager/hotels/[hotelId]/reviews
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { reviewsTable } from "@/lib/db/schema";
import { reviewCreateSchema, reviewPatchSchema } from "@/lib/schemas/hotel-panel";
import { assertBookingBelongsToHotel, assertInquiryBelongsToHotel } from "@/lib/tenant-integrity";
import { logAudit } from "@/lib/audit";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const db = getDb();
  const reviews = await db
    .select()
    .from(reviewsTable)
    .where(eq(reviewsTable.hotelId, guard.hotel.id))
    .orderBy(desc(reviewsTable.createdAt));

  return NextResponse.json({ ok: true, reviews });
}

export async function POST(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = reviewCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (!(await assertInquiryBelongsToHotel(guard.hotel.id, parsed.data.inquiryId))) {
    return NextResponse.json({ ok: false, error: "Talep bulunamadı." }, { status: 404 });
  }
  if (!(await assertBookingBelongsToHotel(guard.hotel.id, parsed.data.bookingId))) {
    return NextResponse.json({ ok: false, error: "Rezervasyon bulunamadı." }, { status: 404 });
  }

  const db = getDb();
  const [review] = await db
    .insert(reviewsTable)
    .values({
      ...parsed.data,
      hotelId: guard.hotel.id,
      status: "beklemede",
      createdBy: guard.user.id,
    })
    .returning();

  await logAudit({ actor: guard.user, action: "yorum.olusturuldu", entityType: "hotel", entityId: guard.hotel.id, meta: { reviewId: review.id, source: review.source } });

  return NextResponse.json({ ok: true, review }, { status: 201 });
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = reviewPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id, reply } = parsed.data;
  const db = getDb();
  const [updated] = await db
    .update(reviewsTable)
    .set({
      ...(reply !== undefined ? { reply, repliedAt: new Date() } : {}),
    })
    .where(and(eq(reviewsTable.id, id), eq(reviewsTable.hotelId, guard.hotel.id)))
    .returning();

  if (!updated) {
    return NextResponse.json({ ok: false, error: "Yorum bulunamadı." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, review: updated });
}

// ---------------------------------------------------------------------------
// GET/POST /api/manager/hotels/[hotelId]/tours — tur listesi / yeni tur
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { toursTable } from "@/lib/db/schema";
import { tourCreateSchema } from "@/lib/schemas/tour-editor";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const db = getDb();
  const tours = await db
    .select({
      id: toursTable.id,
      tourId: toursTable.tourId,
      title: toursTable.title,
      status: toursTable.status,
      moderationNote: toursTable.moderationNote,
      version: toursTable.version,
      publishedAt: toursTable.publishedAt,
      updatedAt: toursTable.updatedAt,
    })
    .from(toursTable)
    .where(eq(toursTable.hotelId, guard.hotel.id))
    .orderBy(toursTable.createdAt);

  return NextResponse.json({ ok: true, tours });
}

export async function POST(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = tourCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  try {
    const [tour] = await db
      .insert(toursTable)
      .values({
        hotelId: guard.hotel.id,
        hotelSlug: guard.hotel.slug,
        tourId: parsed.data.tourId,
        title: parsed.data.title,
      })
      .returning();
    return NextResponse.json({ ok: true, tour }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/unique|duplicate/i.test(msg)) {
      return NextResponse.json(
        { ok: false, error: "Bu tur kimliği zaten kullanılıyor." },
        { status: 409 },
      );
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// POST .../new-version — yayında tur için yeni taslak sürüm
// Adımları korur, sürümü artırır, durumu taslak yapar; publishedManifest kalır.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { toursTable } from "@/lib/db/schema";

type RouteParams = { params: Promise<{ hotelId: string; tourId: string }> };

export async function POST(_req: Request, { params }: RouteParams) {
  const { hotelId, tourId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const db = getDb();
  const [tour] = await db
    .select()
    .from(toursTable)
    .where(and(eq(toursTable.hotelId, guard.hotel.id), eq(toursTable.tourId, tourId)))
    .limit(1);

  if (!tour) {
    return NextResponse.json({ ok: false, error: "Tur bulunamadı." }, { status: 404 });
  }
  if (tour.status !== "yayinda") {
    return NextResponse.json(
      { ok: false, error: "Yeni sürüm yalnızca yayındaki turlar için oluşturulabilir." },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(toursTable)
    .set({
      version: tour.version + 1,
      status: "taslak",
      moderationNote: null,
      submittedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(toursTable.id, tour.id))
    .returning();

  return NextResponse.json({ ok: true, tour: updated });
}

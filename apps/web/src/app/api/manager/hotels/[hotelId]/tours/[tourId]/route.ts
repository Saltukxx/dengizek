// ---------------------------------------------------------------------------
// GET/PATCH/DELETE /api/manager/hotels/[hotelId]/tours/[tourId]
// GET: tur meta + taslak adımlar; PATCH: başlık; DELETE: tur + adımları sil
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { tourStepsTable, toursTable } from "@/lib/db/schema";
import { tourUpdateSchema } from "@/lib/schemas/tour-editor";
import { logAudit } from "@/lib/audit";

type RouteParams = { params: Promise<{ hotelId: string; tourId: string }> };

async function findTour(hotelId: string, tourId: string) {
  const db = getDb();
  const [tour] = await db
    .select()
    .from(toursTable)
    .where(and(eq(toursTable.hotelId, hotelId), eq(toursTable.tourId, tourId)))
    .limit(1);
  return tour;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { hotelId, tourId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const tour = await findTour(guard.hotel.id, tourId);
  if (!tour) {
    return NextResponse.json({ ok: false, error: "Tur bulunamadı." }, { status: 404 });
  }

  const db = getDb();
  const steps = await db
    .select()
    .from(tourStepsTable)
    .where(
      and(
        eq(tourStepsTable.hotelSlug, guard.hotel.slug),
        eq(tourStepsTable.tourId, tourId),
      ),
    )
    .orderBy(tourStepsTable.orderIndex);

  return NextResponse.json({ ok: true, tour, steps });
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { hotelId, tourId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = tourUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const tour = await findTour(guard.hotel.id, tourId);
  if (!tour) {
    return NextResponse.json({ ok: false, error: "Tur bulunamadı." }, { status: 404 });
  }

  const db = getDb();
  const [updated] = await db
    .update(toursTable)
    .set({ title: parsed.data.title, updatedAt: new Date() })
    .where(eq(toursTable.id, tour.id))
    .returning();

  return NextResponse.json({ ok: true, tour: updated });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { hotelId, tourId } = await params;
  // Tur silme yıkıcıdır — yalnızca tesis sahibi (owner) yapabilir
  const guard = await requireHotelAccess(hotelId, "owner");
  if (guard.response) return guard.response;

  const tour = await findTour(guard.hotel.id, tourId);
  if (!tour) {
    return NextResponse.json({ ok: false, error: "Tur bulunamadı." }, { status: 404 });
  }

  const db = getDb();
  // neon-http transaction desteklemez — önce adımlar, sonra tur silinir;
  // yarıda kalırsa tekrar DELETE idempotent şekilde tamamlar.
  await db
    .delete(tourStepsTable)
    .where(
      and(
        eq(tourStepsTable.hotelSlug, guard.hotel.slug),
        eq(tourStepsTable.tourId, tourId),
      ),
    );
  await db.delete(toursTable).where(eq(toursTable.id, tour.id));

  await logAudit({
    actor: guard.user,
    action: "tur.silindi",
    entityType: "tour",
    entityId: tour.id,
    meta: { hotelSlug: guard.hotel.slug, tourId },
  });

  return NextResponse.json({ ok: true });
}

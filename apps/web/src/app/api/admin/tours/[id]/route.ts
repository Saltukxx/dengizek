// ---------------------------------------------------------------------------
// DELETE /api/admin/tours/[id] — platform yöneticisi tur silme
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { tourStepsTable, toursTable } from "@/lib/db/schema";
import { logAudit } from "@/lib/audit";

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: RouteParams) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const { id } = await params;
  const db = getDb();

  const [tour] = await db.select().from(toursTable).where(eq(toursTable.id, id)).limit(1);
  if (!tour) {
    return NextResponse.json({ ok: false, error: "Tur bulunamadı." }, { status: 404 });
  }

  await db
    .delete(tourStepsTable)
    .where(
      and(eq(tourStepsTable.hotelSlug, tour.hotelSlug), eq(tourStepsTable.tourId, tour.tourId)),
    );
  await db.delete(toursTable).where(eq(toursTable.id, tour.id));

  await logAudit({
    actor: guard.user,
    action: "admin.tur.silindi",
    entityType: "tour",
    entityId: tour.id,
    meta: { hotelSlug: tour.hotelSlug, tourId: tour.tourId },
  });

  return NextResponse.json({ ok: true });
}

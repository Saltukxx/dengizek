// ---------------------------------------------------------------------------
// POST /api/manager/hotels/[hotelId]/tours/[tourId]/submit
// Taslağı bütünlük kontrolünden geçirip incelemeye gönderir
// (taslak | reddedildi → incelemede)
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { toursTable } from "@/lib/db/schema";
import { getManifestFromDB } from "@/lib/db/manifest";
import { tourManifestSchema } from "@/lib/schemas/tour-manifest";
import { logAudit } from "@/lib/audit";

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
  if (tour.status === "incelemede") {
    return NextResponse.json({ ok: false, error: "Tur zaten incelemede." }, { status: 409 });
  }

  // Taslak bütünlük kontrolü: manifest şeması + dal hedefleri
  const draft = await getManifestFromDB(guard.hotel.slug, tourId);
  if (!draft) {
    return NextResponse.json(
      { ok: false, error: "Tur adımları eksik — incelemeye göndermeden önce en az bir adım ekleyin." },
      { status: 400 },
    );
  }

  const validated = tourManifestSchema.safeParse(draft);
  if (!validated.success) {
    return NextResponse.json(
      { ok: false, error: "Tur taslağı geçersiz", issues: validated.error.flatten() },
      { status: 400 },
    );
  }

  const stepIds = new Set(draft.steps.map((s) => s.stepId));
  for (const step of draft.steps) {
    for (const branch of step.branches ?? []) {
      if (!stepIds.has(branch.nextStepId)) {
        return NextResponse.json(
          {
            ok: false,
            error: `"${step.stepId}" adımındaki dal hedefi bulunamadı: "${branch.nextStepId}"`,
          },
          { status: 400 },
        );
      }
    }
  }

  const [updated] = await db
    .update(toursTable)
    .set({
      status: "incelemede",
      submittedAt: new Date(),
      moderationNote: null,
      updatedAt: new Date(),
    })
    .where(eq(toursTable.id, tour.id))
    .returning({ status: toursTable.status });

  await logAudit({
    actor: guard.user,
    action: "tur.incelemeye-gonderildi",
    entityType: "tour",
    entityId: tour.id,
    meta: { hotelSlug: guard.hotel.slug, tourId, eskiDurum: tour.status },
  });

  return NextResponse.json({ ok: true, status: updated.status });
}

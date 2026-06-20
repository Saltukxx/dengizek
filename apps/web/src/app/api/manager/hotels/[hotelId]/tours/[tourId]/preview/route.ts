// ---------------------------------------------------------------------------
// GET /api/manager/hotels/[hotelId]/tours/[tourId]/preview
// Taslak manifest — yalnızca otel erişimi olan kullanıcılar (misafir rotasına yansımaz).
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { toursTable } from "@/lib/db/schema";
import { getManifestFromDB } from "@/lib/db/manifest";
import { tourManifestSchema } from "@/lib/schemas/tour-manifest";

type RouteParams = { params: Promise<{ hotelId: string; tourId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { hotelId, tourId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const db = getDb();
  const [tour] = await db
    .select({ title: toursTable.title, status: toursTable.status })
    .from(toursTable)
    .where(and(eq(toursTable.hotelId, guard.hotel.id), eq(toursTable.tourId, tourId)))
    .limit(1);

  if (!tour) {
    return NextResponse.json({ ok: false, error: "Tur bulunamadı." }, { status: 404 });
  }

  const draft = await getManifestFromDB(guard.hotel.slug, tourId);
  if (!draft) {
    return NextResponse.json(
      { ok: false, error: "Tur adımları bulunamadı — önce en az bir adım ekleyin." },
      { status: 404 },
    );
  }

  const validated = tourManifestSchema.safeParse({
    ...draft,
    title: tour.title,
  });
  if (!validated.success) {
    return NextResponse.json(
      { ok: false, error: "Taslak geçersiz", issues: validated.error.flatten() },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    manifest: validated.data,
    hotelSlug: guard.hotel.slug,
    hotelName: guard.hotel.name,
    tourStatus: tour.status,
    isDraft: true,
  });
}

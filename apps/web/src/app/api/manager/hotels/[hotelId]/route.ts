// ---------------------------------------------------------------------------
// GET/PATCH /api/manager/hotels/[hotelId] — tesis bilgisi okuma/güncelleme
// hotelId: uuid veya slug kabul edilir (requireHotelAccess çözümler)
// İçerik güncellemesi yayın durumunu DEĞİŞTİRMEZ.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { clearFactCatalogCache } from "@/lib/ai/fact-store";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { hotelsTable } from "@/lib/db/schema";
import { hotelUpdateSchema } from "@/lib/schemas/hotel-admin";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const db = getDb();
  const [hotel] = await db
    .select()
    .from(hotelsTable)
    .where(eq(hotelsTable.id, guard.hotel.id))
    .limit(1);

  if (!hotel) {
    return NextResponse.json({ ok: false, error: "Tesis bulunamadı." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, hotel });
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = hotelUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const [updated] = await db
    .update(hotelsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(hotelsTable.id, guard.hotel.id))
    .returning();

  const aiCacheFields = [
    "aiFacts",
    "aiPolicies",
    "aiPersona",
    "cancellationPolicy",
    "childPolicy",
    "petsAllowed",
    "checkInTime",
    "checkOutTime",
    "amenities",
  ] as const;
  if (aiCacheFields.some((f) => f in parsed.data)) {
    clearFactCatalogCache(guard.hotel.slug);
  }

  return NextResponse.json({ ok: true, hotel: updated });
}

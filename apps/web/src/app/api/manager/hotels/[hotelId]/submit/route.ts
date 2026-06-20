// ---------------------------------------------------------------------------
// POST /api/manager/hotels/[hotelId]/submit — tesisi incelemeye gönder
// taslak | reddedildi → incelemede
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { hotelsTable } from "@/lib/db/schema";
import { logAudit } from "@/lib/audit";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function POST(_req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const db = getDb();
  const [hotel] = await db
    .select({ status: hotelsTable.status })
    .from(hotelsTable)
    .where(eq(hotelsTable.id, guard.hotel.id))
    .limit(1);

  if (!hotel) {
    return NextResponse.json({ ok: false, error: "Tesis bulunamadı." }, { status: 404 });
  }
  if (hotel.status === "incelemede") {
    return NextResponse.json(
      { ok: false, error: "Tesis zaten incelemede." },
      { status: 409 },
    );
  }
  if (hotel.status === "yayinda") {
    return NextResponse.json(
      { ok: false, error: "Tesis zaten yayında." },
      { status: 409 },
    );
  }

  const [updated] = await db
    .update(hotelsTable)
    .set({ status: "incelemede", submittedAt: new Date(), updatedAt: new Date() })
    .where(eq(hotelsTable.id, guard.hotel.id))
    .returning();

  await logAudit({
    actor: guard.user,
    action: "otel.incelemeye-gonderildi",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { eskiDurum: hotel.status, yeniDurum: "incelemede" },
  });

  return NextResponse.json({ ok: true, status: updated.status });
}

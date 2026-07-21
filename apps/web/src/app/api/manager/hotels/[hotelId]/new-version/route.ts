// ---------------------------------------------------------------------------
// POST .../new-version — yayında tesis için yeni taslak sürüm
// Yayındaki içeriği (publishedSnapshot) korur, durumu taslağa alır;
// böylece "İncelemeye gönder" tekrar açılır. Turların new-version rotasıyla
// aynı desen.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
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
    .select({ id: hotelsTable.id, status: hotelsTable.status, slug: hotelsTable.slug })
    .from(hotelsTable)
    .where(eq(hotelsTable.id, guard.hotel.id))
    .limit(1);

  if (!hotel) {
    return NextResponse.json({ ok: false, error: "Tesis bulunamadı." }, { status: 404 });
  }
  if (hotel.status !== "yayinda") {
    return NextResponse.json(
      { ok: false, error: "Yeni sürüm yalnızca yayındaki tesisler için oluşturulabilir." },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(hotelsTable)
    .set({
      status: "taslak",
      draftRevision: sql`${hotelsTable.draftRevision} + 1`,
      moderationNote: null,
      submittedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(hotelsTable.id, hotel.id))
    .returning();

  await logAudit({
    actor: guard.user,
    action: "otel.yeni-surum",
    entityType: "hotel",
    entityId: hotel.id,
    meta: { slug: hotel.slug },
  });

  return NextResponse.json({ ok: true, hotel: updated });
}

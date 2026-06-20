// ---------------------------------------------------------------------------
// DELETE /api/manager/media/[id] — medya varlığını Bunny'den ve DB'den sil
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { mediaAssetsTable } from "@/lib/db/schema";
import { deleteVideo } from "@/lib/bunny/client";
import { logAudit } from "@/lib/audit";

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id } = await params;

  const db = getDb();
  const [asset] = await db
    .select()
    .from(mediaAssetsTable)
    .where(eq(mediaAssetsTable.id, id))
    .limit(1);

  if (!asset) {
    return NextResponse.json({ ok: false, error: "Medya bulunamadı." }, { status: 404 });
  }

  // Yetki: varlığın ait olduğu otel üzerinden doğrulanır
  const guard = await requireHotelAccess(asset.hotelId);
  if (guard.response) return guard.response;

  if (asset.bunnyVideoGuid) {
    try {
      await deleteVideo(asset.bunnyVideoGuid);
    } catch (err) {
      console.error("[media] Bunny silme hatası:", err);
      return NextResponse.json(
        { ok: false, error: "Video servisinden silinemedi. Lütfen tekrar deneyin." },
        { status: 502 },
      );
    }
  }

  await db.delete(mediaAssetsTable).where(eq(mediaAssetsTable.id, asset.id));

  await logAudit({
    actor: guard.user,
    action: "medya.silindi",
    entityType: "media",
    entityId: asset.id,
    meta: { hotelSlug: guard.hotel.slug, guid: asset.bunnyVideoGuid, title: asset.title },
  });

  return NextResponse.json({ ok: true });
}

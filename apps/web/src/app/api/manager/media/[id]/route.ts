// ---------------------------------------------------------------------------
// DELETE /api/manager/media/[id] — medya varlığını Bunny'den ve DB'den sil
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq, or } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import {
  hotelGalleryImagesTable,
  mediaAssetsTable,
  roomsTable,
  tourStepsTable,
} from "@/lib/db/schema";
import { deleteVideo } from "@/lib/bunny/client";
import { logAudit } from "@/lib/audit";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Varlığın URL'ini kullanan içerikleri bulur. Medya silinince yayındaki tur
 * oynatıcı 404 alacağı için silme öncesi zorunlu kontrol — snapshot manifest
 * URL'i dondurduğundan hata ancak çalışma anında görülürdü.
 */
async function findMediaReferences(
  db: ReturnType<typeof getDb>,
  hotelId: string,
  hotelSlug: string,
  url: string,
) {
  const [steps, gallery, rooms] = await Promise.all([
    db
      .select({ tourId: tourStepsTable.tourId, title: tourStepsTable.title })
      .from(tourStepsTable)
      .where(
        and(
          eq(tourStepsTable.hotelSlug, hotelSlug),
          or(
            eq(tourStepsTable.mediaUrl, url),
            eq(tourStepsTable.narrationUrl, url),
            eq(tourStepsTable.captionsVttUrl, url),
          ),
        ),
      ),
    db
      .select({ id: hotelGalleryImagesTable.id })
      .from(hotelGalleryImagesTable)
      .where(and(eq(hotelGalleryImagesTable.hotelId, hotelId), eq(hotelGalleryImagesTable.url, url))),
    db
      .select({ name: roomsTable.name })
      .from(roomsTable)
      .where(and(eq(roomsTable.hotelId, hotelId), eq(roomsTable.imageUrl, url))),
  ]);

  return [
    ...steps.map((s) => `Tur adımı: ${s.tourId} — ${s.title}`),
    ...(gallery.length > 0 ? [`Tesis galerisi (${gallery.length} görsel)`] : []),
    ...rooms.map((r) => `Oda görseli: ${r.name}`),
  ];
}

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

  // Kullanımdaki medya silinemez — önce içerikten çıkarılmalı.
  if (asset.playbackUrl) {
    const references = await findMediaReferences(
      db,
      asset.hotelId,
      guard.hotel.slug,
      asset.playbackUrl,
    );
    if (references.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          code: "MEDIA_IN_USE",
          error: "Bu medya kullanımda — silmeden önce aşağıdaki içeriklerden kaldırın.",
          references,
        },
        { status: 409 },
      );
    }
  }

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

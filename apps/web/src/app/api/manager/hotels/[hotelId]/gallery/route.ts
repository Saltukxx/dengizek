// ---------------------------------------------------------------------------
// GET/POST/PATCH/DELETE /api/manager/hotels/[hotelId]/gallery
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { hotelGalleryImagesTable, mediaCleanupQueueTable } from "@/lib/db/schema";
import { galleryImageSchema, galleryPatchSchema } from "@/lib/schemas/hotel-panel";
import { logAudit } from "@/lib/audit";
import { assertRoomsBelongToHotel } from "@/lib/tenant-integrity";
import { deleteObject } from "@/lib/object-storage";
import { abortPanelMutation, expectedRevisionRequiredResponse, getPanelRevision, panelRevisionConflictResponse, readExpectedRevision, runPanelMutation } from "@/lib/panel-revision";

type RouteParams = { params: Promise<{ hotelId: string }> };

/**
 * objectKey İSTEMCİDEN gelir — başka bir otelin anahtarını bağlayıp sildirerek
 * cross-tenant obje silme yapılmasın diye anahtar bu otelin prefix'ine
 * kilitlenir (yükleme yolu da hotels/{hotelId}/ altına yazar).
 */
function objectKeyBelongsToHotel(objectKey: string | undefined | null, hotelId: string): boolean {
  if (!objectKey) return true;
  return objectKey.startsWith(`hotels/${hotelId}/`);
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const db = getDb();
  const images = await db
    .select()
    .from(hotelGalleryImagesTable)
    .where(eq(hotelGalleryImagesTable.hotelId, guard.hotel.id))
    .orderBy(asc(hotelGalleryImagesTable.sortOrder), asc(hotelGalleryImagesTable.createdAt));

  const revision = await getPanelRevision(db, guard.hotel.id, "gallery");
  return NextResponse.json({ ok: true, images, revision: revision.revision });
}

export async function POST(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const expectedRevision = readExpectedRevision(body);
  if (!expectedRevision) return expectedRevisionRequiredResponse();
  const parsed = galleryImageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (!(await assertRoomsBelongToHotel(guard.hotel.id, [parsed.data.roomId]))) {
    return NextResponse.json({ ok: false, error: "Oda bulunamadı." }, { status: 404 });
  }
  if (!objectKeyBelongsToHotel(parsed.data.objectKey, guard.hotel.id)) {
    return NextResponse.json(
      { ok: false, error: "objectKey bu otele ait değil." },
      { status: 400 },
    );
  }

  let image: typeof hotelGalleryImagesTable.$inferSelect;
  let revision: number;
  try {
    const mutation = await runPanelMutation({
      hotelId: guard.hotel.id, scope: "gallery", expectedRevision, updatedBy: guard.user.id,
      mutate: async (tx) => {
        const existing = await tx.select({ sortOrder: hotelGalleryImagesTable.sortOrder })
          .from(hotelGalleryImagesTable).where(eq(hotelGalleryImagesTable.hotelId, guard.hotel.id));
        const nextOrder = parsed.data.sortOrder
          ?? existing.reduce((m, r) => Math.max(m, r.sortOrder + 1), 0);
        const [created] = await tx.insert(hotelGalleryImagesTable).values({
          hotelId: guard.hotel.id, url: parsed.data.url,
          objectKey: parsed.data.objectKey ?? null, caption: parsed.data.caption ?? null,
          roomId: parsed.data.roomId ?? null, sortOrder: nextOrder,
        }).returning();
        return created;
      },
    });
    image = mutation.result;
    revision = mutation.revision;
  } catch (error) {
    if (parsed.data.objectKey) await deleteObject(parsed.data.objectKey).catch(() => undefined);
    const conflict = panelRevisionConflictResponse(error);
    if (conflict) return conflict;
    throw error;
  }

  await logAudit({
    actor: guard.user,
    action: "galeri.gorsel_eklendi",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { imageId: image.id },
  });

  return NextResponse.json({ ok: true, image, revision }, { status: 201 });
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const expectedRevision = readExpectedRevision(body);
  if (!expectedRevision) return expectedRevisionRequiredResponse();
  const parsed = galleryPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (!(await assertRoomsBelongToHotel(guard.hotel.id, [parsed.data.roomId]))) {
    return NextResponse.json({ ok: false, error: "Oda bulunamadı." }, { status: 404 });
  }
  if (!objectKeyBelongsToHotel(parsed.data.objectKey, guard.hotel.id)) {
    return NextResponse.json(
      { ok: false, error: "objectKey bu otele ait değil." },
      { status: 400 },
    );
  }

  const { id, ...fields } = parsed.data;
  let updated: typeof hotelGalleryImagesTable.$inferSelect | undefined;
  let revision: number;
  try {
    const mutation = await runPanelMutation({
      hotelId: guard.hotel.id, scope: "gallery", expectedRevision, updatedBy: guard.user.id,
      mutate: async (tx) => {
        const [row] = await tx.update(hotelGalleryImagesTable).set(fields).where(and(
          eq(hotelGalleryImagesTable.id, id), eq(hotelGalleryImagesTable.hotelId, guard.hotel.id),
        )).returning();
        if (!row) abortPanelMutation("Görsel bulunamadı.");
        return row;
      },
    });
    updated = mutation.result;
    revision = mutation.revision;
  } catch (error) {
    const conflict = panelRevisionConflictResponse(error);
    if (conflict) return conflict;
    throw error;
  }
  if (!updated) return NextResponse.json({ ok: false, error: "Görsel bulunamadı." }, { status: 404 });
  await logAudit({
    actor: guard.user,
    action: "galeri.gorsel_guncellendi",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { imageId: updated.id },
  });
  return NextResponse.json({ ok: true, image: updated, revision });
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const expectedRevision = readExpectedRevision(body);
  if (!expectedRevision) return expectedRevisionRequiredResponse();
  const id = body?.id as string | undefined;
  if (!id) {
    return NextResponse.json({ ok: false, error: "id gerekli." }, { status: 400 });
  }

  let deleted: typeof hotelGalleryImagesTable.$inferSelect | undefined;
  let revision: number;
  try {
    const mutation = await runPanelMutation({
      hotelId: guard.hotel.id, scope: "gallery", expectedRevision, updatedBy: guard.user.id,
      mutate: async (tx) => {
        const [row] = await tx.delete(hotelGalleryImagesTable).where(and(
          eq(hotelGalleryImagesTable.id, id), eq(hotelGalleryImagesTable.hotelId, guard.hotel.id),
        )).returning();
        if (!row) abortPanelMutation("Görsel bulunamadı.");
        if (row?.objectKey) await tx.insert(mediaCleanupQueueTable).values({ objectKey: row.objectKey });
        return row;
      },
    });
    deleted = mutation.result;
    revision = mutation.revision;
  } catch (error) {
    const conflict = panelRevisionConflictResponse(error);
    if (conflict) return conflict;
    throw error;
  }

  if (!deleted) return NextResponse.json({ ok: false, error: "Görsel bulunamadı." }, { status: 404 });

  await logAudit({
    actor: guard.user,
    action: "galeri.gorsel_silindi",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { imageId: id },
  });

  return NextResponse.json({ ok: true, revision });
}

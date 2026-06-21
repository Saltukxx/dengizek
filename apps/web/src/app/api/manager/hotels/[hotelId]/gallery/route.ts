// ---------------------------------------------------------------------------
// GET/POST/PATCH/DELETE /api/manager/hotels/[hotelId]/gallery
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { hotelGalleryImagesTable } from "@/lib/db/schema";
import { galleryImageSchema, galleryPatchSchema } from "@/lib/schemas/hotel-panel";
import { logAudit } from "@/lib/audit";

type RouteParams = { params: Promise<{ hotelId: string }> };

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

  return NextResponse.json({ ok: true, images });
}

export async function POST(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = galleryImageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const existing = await db
    .select({ sortOrder: hotelGalleryImagesTable.sortOrder })
    .from(hotelGalleryImagesTable)
    .where(eq(hotelGalleryImagesTable.hotelId, guard.hotel.id));
  const nextOrder = parsed.data.sortOrder ?? existing.reduce((m, r) => Math.max(m, r.sortOrder + 1), 0);

  const [image] = await db
    .insert(hotelGalleryImagesTable)
    .values({
      hotelId: guard.hotel.id,
      url: parsed.data.url,
      caption: parsed.data.caption ?? null,
      roomId: parsed.data.roomId ?? null,
      sortOrder: nextOrder,
    })
    .returning();

  await logAudit({
    actor: guard.user,
    action: "galeri.gorsel_eklendi",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { imageId: image.id },
  });

  return NextResponse.json({ ok: true, image }, { status: 201 });
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = galleryPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id, ...fields } = parsed.data;
  const db = getDb();
  const [updated] = await db
    .update(hotelGalleryImagesTable)
    .set(fields)
    .where(
      and(eq(hotelGalleryImagesTable.id, id), eq(hotelGalleryImagesTable.hotelId, guard.hotel.id)),
    )
    .returning();

  if (!updated) {
    return NextResponse.json({ ok: false, error: "Görsel bulunamadı." }, { status: 404 });
  }
  await logAudit({
    actor: guard.user,
    action: "galeri.gorsel_guncellendi",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { imageId: updated.id },
  });
  return NextResponse.json({ ok: true, image: updated });
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const id = body?.id as string | undefined;
  if (!id) {
    return NextResponse.json({ ok: false, error: "id gerekli." }, { status: 400 });
  }

  const db = getDb();
  await db
    .delete(hotelGalleryImagesTable)
    .where(
      and(eq(hotelGalleryImagesTable.id, id), eq(hotelGalleryImagesTable.hotelId, guard.hotel.id)),
    );

  await logAudit({
    actor: guard.user,
    action: "galeri.gorsel_silindi",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { imageId: id },
  });

  return NextResponse.json({ ok: true });
}

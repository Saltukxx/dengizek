// ---------------------------------------------------------------------------
// GET /api/admin/hotels/[hotelId] — tesis detayı + üyeler + tur özeti
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import {
  hotelMembersTable,
  hotelsTable,
  toursTable,
  usersTable,
} from "@/lib/db/schema";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const { hotelId } = await params;
  const db = getDb();

  const [hotel] = await db
    .select()
    .from(hotelsTable)
    .where(eq(hotelsTable.id, hotelId))
    .limit(1);

  if (!hotel) {
    return NextResponse.json({ ok: false, error: "Tesis bulunamadı." }, { status: 404 });
  }
  const reviewSnapshot = hotel.status === "incelemede" ? hotel.submittedSnapshot : null;
  const snapshotValue = <T>(key: string, fallback: T) =>
    reviewSnapshot?.hotel && key in reviewSnapshot.hotel ? reviewSnapshot.hotel[key] as T : fallback;

  const members = await db
    .select({
      userId: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: hotelMembersTable.role,
      isActive: usersTable.isActive,
    })
    .from(hotelMembersTable)
    .innerJoin(usersTable, eq(hotelMembersTable.userId, usersTable.id))
    .where(eq(hotelMembersTable.hotelId, hotel.id))
    .orderBy(usersTable.name);

  const tours = await db
    .select({
      id: toursTable.id,
      tourId: toursTable.tourId,
      title: toursTable.title,
      status: toursTable.status,
      version: toursTable.version,
      submittedAt: toursTable.submittedAt,
      submittedRevision: toursTable.submittedRevision,
      publishedAt: toursTable.publishedAt,
    })
    .from(toursTable)
    .where(eq(toursTable.hotelId, hotel.id))
    .orderBy(toursTable.title);

  return NextResponse.json({
    ok: true,
    hotel: {
      id: hotel.id,
      slug: hotel.slug,
      name: snapshotValue("name", hotel.name),
      city: snapshotValue("city", hotel.city),
      country: snapshotValue("country", hotel.country),
      status: hotel.status,
      moderationNote: hotel.moderationNote,
      submittedAt: hotel.submittedAt,
      submittedRevision: hotel.submittedRevision,
      publishedRevision: hotel.publishedRevision,
      draftRevision: hotel.draftRevision,
      hasUnpublishedChanges: hotel.draftRevision !== (hotel.publishedRevision ?? 0),
      reviewedAt: hotel.reviewedAt,
      createdAt: hotel.createdAt,
      imageUrl: snapshotValue("imageUrl", hotel.imageUrl),
      shortDescription: snapshotValue("shortDescription", hotel.shortDescription),
      suspendedAt: hotel.suspendedAt,
      suspensionNote: hotel.suspensionNote,
    },
    members,
    tours,
  });
}

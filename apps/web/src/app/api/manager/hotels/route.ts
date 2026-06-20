// ---------------------------------------------------------------------------
// GET /api/manager/hotels — kullanıcının üye olduğu oteller
// (admin tüm otelleri görür)
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { hotelMembersTable, hotelsTable } from "@/lib/db/schema";

export async function GET() {
  const guard = await requireUser();
  if (guard.response) return guard.response;
  const user = guard.user;

  const db = getDb();

  if (user.role === "admin") {
    const hotels = await db
      .select({
        id: hotelsTable.id,
        slug: hotelsTable.slug,
        name: hotelsTable.name,
        city: hotelsTable.city,
        country: hotelsTable.country,
        status: hotelsTable.status,
        moderationNote: hotelsTable.moderationNote,
      })
      .from(hotelsTable)
      .orderBy(hotelsTable.name);
    return NextResponse.json({ ok: true, hotels });
  }

  const hotels = await db
    .select({
      id: hotelsTable.id,
      slug: hotelsTable.slug,
      name: hotelsTable.name,
      city: hotelsTable.city,
      country: hotelsTable.country,
      status: hotelsTable.status,
      moderationNote: hotelsTable.moderationNote,
      memberRole: hotelMembersTable.role,
    })
    .from(hotelMembersTable)
    .innerJoin(hotelsTable, eq(hotelMembersTable.hotelId, hotelsTable.id))
    .where(eq(hotelMembersTable.userId, user.id))
    .orderBy(hotelsTable.name);

  return NextResponse.json({ ok: true, hotels });
}

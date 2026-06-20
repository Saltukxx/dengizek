// ---------------------------------------------------------------------------
// POST/DELETE /api/admin/users/[id]/memberships — otele ata / üyelik kaldır
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { hotelMembersTable, hotelsTable, usersTable } from "@/lib/db/schema";
import { assignMemberSchema, removeMemberSchema } from "@/lib/schemas/member";
import { logAudit } from "@/lib/audit";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const { id: userId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = assignMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const [user] = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Kullanıcı bulunamadı." }, { status: 404 });
  }

  const [hotel] = await db
    .select({ id: hotelsTable.id, slug: hotelsTable.slug })
    .from(hotelsTable)
    .where(eq(hotelsTable.id, parsed.data.hotelId))
    .limit(1);
  if (!hotel) {
    return NextResponse.json({ ok: false, error: "Tesis bulunamadı." }, { status: 404 });
  }

  await db
    .insert(hotelMembersTable)
    .values({ userId, hotelId: hotel.id, role: parsed.data.role })
    .onConflictDoUpdate({
      target: [hotelMembersTable.userId, hotelMembersTable.hotelId],
      set: { role: parsed.data.role },
    });

  await logAudit({
    actor: guard.user,
    action: "uyelik.atandi",
    entityType: "user",
    entityId: userId,
    meta: { email: user.email, hotelSlug: hotel.slug, role: parsed.data.role },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const { id: userId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = removeMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  await db
    .delete(hotelMembersTable)
    .where(
      and(
        eq(hotelMembersTable.userId, userId),
        eq(hotelMembersTable.hotelId, parsed.data.hotelId),
      ),
    );

  await logAudit({
    actor: guard.user,
    action: "uyelik.kaldirildi",
    entityType: "user",
    entityId: userId,
    meta: { hotelId: parsed.data.hotelId },
  });

  return NextResponse.json({ ok: true });
}

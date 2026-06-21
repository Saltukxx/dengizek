// ---------------------------------------------------------------------------
// GET/POST/DELETE /api/manager/hotels/[hotelId]/members — tesis ekibi (owner)
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireHotelAccess } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { hotelMembersTable, usersTable } from "@/lib/db/schema";
import { hotelMemberAddSchema, hotelMemberRemoveSchema } from "@/lib/schemas/hotel-panel";
import { logAudit } from "@/lib/audit";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId, "owner");
  if (guard.response) return guard.response;

  const db = getDb();
  const members = await db
    .select({
      id: hotelMembersTable.id,
      userId: hotelMembersTable.userId,
      role: hotelMembersTable.role,
      email: usersTable.email,
      name: usersTable.name,
      createdAt: hotelMembersTable.createdAt,
    })
    .from(hotelMembersTable)
    .innerJoin(usersTable, eq(hotelMembersTable.userId, usersTable.id))
    .where(eq(hotelMembersTable.hotelId, guard.hotel.id));

  return NextResponse.json({ ok: true, members });
}

export async function POST(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId, "owner");
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = hotelMemberAddSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, parsed.data.email.toLowerCase()))
    .limit(1);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Kullanıcı bulunamadı." }, { status: 404 });
  }

  try {
    const [member] = await db
      .insert(hotelMembersTable)
      .values({
        userId: user.id,
        hotelId: guard.hotel.id,
        role: parsed.data.role,
      })
      .returning();
    await logAudit({
      actor: guard.user,
      action: "uye.eklendi",
      entityType: "hotel",
      entityId: guard.hotel.id,
      meta: { memberId: member.id, email: parsed.data.email, role: parsed.data.role },
    });
    return NextResponse.json({ ok: true, member }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/unique|duplicate/i.test(msg)) {
      return NextResponse.json({ ok: false, error: "Kullanıcı zaten üye." }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId, "owner");
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = hotelMemberRemoveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();

  const owners = await db
    .select({ userId: hotelMembersTable.userId, role: hotelMembersTable.role })
    .from(hotelMembersTable)
    .where(eq(hotelMembersTable.hotelId, guard.hotel.id));

  const target = owners.find((m) => m.userId === parsed.data.userId);
  if (!target) {
    return NextResponse.json({ ok: false, error: "Üye bulunamadı." }, { status: 404 });
  }

  const ownerCount = owners.filter((m) => m.role === "owner").length;
  if (target.role === "owner" && ownerCount <= 1) {
    return NextResponse.json(
      { ok: false, error: "Son sahip silinemez. Önce başka bir sahip atayın." },
      { status: 409 },
    );
  }

  await db
    .delete(hotelMembersTable)
    .where(
      and(
        eq(hotelMembersTable.hotelId, guard.hotel.id),
        eq(hotelMembersTable.userId, parsed.data.userId),
      ),
    );

  await logAudit({
    actor: guard.user,
    action: "uye.kaldirildi",
    entityType: "hotel",
    entityId: guard.hotel.id,
    meta: { userId: parsed.data.userId },
  });

  return NextResponse.json({ ok: true });
}

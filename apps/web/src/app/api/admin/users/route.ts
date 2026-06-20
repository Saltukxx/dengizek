// ---------------------------------------------------------------------------
// GET/POST /api/admin/users — kullanıcı listesi / yeni otel yöneticisi
// passwordHash hiçbir zaman seçilmez/dönülmez.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { hotelMembersTable, hotelsTable, usersTable } from "@/lib/db/schema";
import { createUserSchema } from "@/lib/schemas/auth";
import { hashPassword } from "@/lib/auth/password";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const db = getDb();
  const users = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(usersTable.email);

  // Üyelikler (otel adlarıyla) — kullanıcı başına liste
  const memberships = await db
    .select({
      userId: hotelMembersTable.userId,
      hotelId: hotelMembersTable.hotelId,
      role: hotelMembersTable.role,
      hotelName: hotelsTable.name,
      hotelSlug: hotelsTable.slug,
    })
    .from(hotelMembersTable)
    .innerJoin(hotelsTable, eq(hotelMembersTable.hotelId, hotelsTable.id));

  const byUser = new Map<string, typeof memberships>();
  for (const m of memberships) {
    const list = byUser.get(m.userId) ?? [];
    list.push(m);
    byUser.set(m.userId, list);
  }

  return NextResponse.json({
    ok: true,
    users: users.map((u) => ({ ...u, memberships: byUser.get(u.id) ?? [] })),
  });
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const email = parsed.data.email.toLowerCase().trim();

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  if (existing) {
    return NextResponse.json(
      { ok: false, error: "Bu e-posta ile kayıtlı bir kullanıcı zaten var." },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const [user] = await db
    .insert(usersTable)
    .values({
      email,
      name: parsed.data.name,
      role: parsed.data.role,
      passwordHash,
    })
    .returning({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      isActive: usersTable.isActive,
    });

  await logAudit({
    actor: guard.user,
    action: "kullanici.olusturuldu",
    entityType: "user",
    entityId: user.id,
    meta: { email: user.email, role: user.role },
  });

  return NextResponse.json({ ok: true, user }, { status: 201 });
}

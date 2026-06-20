// ---------------------------------------------------------------------------
// PATCH /api/admin/users/[id] — ad/rol/aktiflik/şifre güncelleme
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { usersTable } from "@/lib/db/schema";
import { updateUserSchema } from "@/lib/schemas/auth";
import { hashPassword } from "@/lib/auth/password";
import { logAudit } from "@/lib/audit";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: RouteParams) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Doğrulama başarısız", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Admin kendi hesabını pasifleştiremez / rolünü düşüremez (kilitlenme koruması)
  if (id === guard.user.id && (parsed.data.isActive === false || parsed.data.role === "manager")) {
    return NextResponse.json(
      { ok: false, error: "Kendi hesabınızın yetkisini düşüremez veya pasifleştiremezsiniz." },
      { status: 400 },
    );
  }

  const db = getDb();
  const [existing] = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Kullanıcı bulunamadı." }, { status: 404 });
  }

  const { password, ...rest } = parsed.data;
  const updates: Record<string, unknown> = { ...rest, updatedAt: new Date() };
  if (password) {
    updates.passwordHash = await hashPassword(password);
  }

  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, id))
    .returning();

  await logAudit({
    actor: guard.user,
    action: "kullanici.guncellendi",
    entityType: "user",
    entityId: id,
    meta: {
      email: existing.email,
      alanlar: Object.keys(parsed.data),
      sifreDegisti: Boolean(password),
    },
  });

  return NextResponse.json({ ok: true, user });
}

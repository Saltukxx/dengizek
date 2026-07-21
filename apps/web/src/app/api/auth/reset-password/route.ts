// ---------------------------------------------------------------------------
// POST /api/auth/reset-password — token'ı tüketip yeni şifre belirler
// ---------------------------------------------------------------------------

import { and, eq, gt, sql } from "drizzle-orm";
import { getDb, isDbConfigured } from "@/lib/db";
import { usersTable } from "@/lib/db/schema";
import { resetPasswordSchema } from "@/lib/schemas/auth";
import { hashResetToken } from "@/lib/password-reset";
import { hashPassword } from "@/lib/auth/password";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { apiFail, apiOk, apiRateLimited, apiServiceUnavailable } from "@/lib/api-response";
import { logAudit } from "@/lib/audit";

export async function POST(req: Request) {
  if (!isDbConfigured()) {
    return apiServiceUnavailable("Servis kullanılamıyor.");
  }

  const body = await req.json().catch(() => null);
  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return apiFail("Doğrulama başarısız", 400, { issues: parsed.error.flatten() });
  }

  if (
    !(await checkRateLimit(`reset-password:${requestIp(req)}`, {
      name: "reset-password-ip",
      windowMs: 60_000,
      limit: 10,
      failClosed: true,
    }))
  ) {
    return apiRateLimited();
  }

  const db = getDb();
  const tokenHash = hashResetToken(parsed.data.token);
  const passwordHash = await hashPassword(parsed.data.password);

  // Tek atomik UPDATE: koşul (hash + süre) WHERE'de olduğundan aynı token'la
  // eşzamanlı iki istekten yalnızca biri geçer — SELECT-sonra-UPDATE yarışı yok.
  const [user] = await db
    .update(usersTable)
    .set({
      passwordHash,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
      tokenVersion: sql`${usersTable.tokenVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(usersTable.resetTokenHash, tokenHash), gt(usersTable.resetTokenExpiresAt, new Date())))
    .returning();

  if (!user) {
    return apiFail("Bağlantının süresi dolmuş veya geçersiz. Yeniden şifre sıfırlama talep edin.", 400, {
      code: "INVALID_TOKEN",
    });
  }

  await logAudit({
    actor: { id: user.id, email: user.email, name: user.name, role: user.role, tokenVersion: 0 },
    action: "kullanici.sifre_sifirlandi",
    entityType: "user",
    entityId: user.id,
    meta: { yontem: "sifremi_unuttum" },
  });

  return apiOk({ reset: true });
}

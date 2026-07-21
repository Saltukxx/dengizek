// ---------------------------------------------------------------------------
// POST /api/auth/forgot-password — sıfırlama e-postası gönder
// Kullanıcı numaralandırmasını önlemek için e-posta var/yok fark etmeksizin
// her zaman ok:true döner.
// ---------------------------------------------------------------------------

import { eq } from "drizzle-orm";
import { getDb, isDbConfigured } from "@/lib/db";
import { usersTable } from "@/lib/db/schema";
import { forgotPasswordSchema } from "@/lib/schemas/auth";
import { issueResetToken, RESET_TOKEN_MINUTES } from "@/lib/password-reset";
import { sendEmail } from "@/lib/email";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { apiFail, apiOk, apiRateLimited, apiServiceUnavailable } from "@/lib/api-response";

export async function POST(req: Request) {
  if (!isDbConfigured()) {
    return apiServiceUnavailable("Servis kullanılamıyor.");
  }

  const body = await req.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return apiFail("Geçerli bir e-posta girin.", 400, { issues: parsed.error.flatten() });
  }

  if (
    !(await checkRateLimit(`forgot-password:${requestIp(req)}`, {
      name: "forgot-password-ip",
      windowMs: 60_000,
      limit: 5,
      failClosed: true,
    })) ||
    !(await checkRateLimit(`forgot-password:${parsed.data.email.toLowerCase()}`, {
      name: "forgot-password-email",
      windowMs: 15 * 60_000,
      limit: 3,
      failClosed: true,
    }))
  ) {
    return apiRateLimited();
  }

  const db = getDb();
  const [user] = await db
    .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name, isActive: usersTable.isActive })
    .from(usersTable)
    .where(eq(usersTable.email, parsed.data.email.toLowerCase()))
    .limit(1);

  if (user?.isActive) {
    const token = await issueResetToken(db, user.id);
    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/sifremi-sifirla/${token}`;
    await sendEmail({
      to: user.email,
      subject: "Şifre sıfırlama — Dengizek",
      text: `Merhaba ${user.name},\n\nŞifrenizi sıfırlamak için: ${resetUrl}\n\nBu bağlantı ${RESET_TOKEN_MINUTES} dakika geçerlidir. Bu talebi siz yapmadıysanız bu e-postayı yok sayabilirsiniz.`,
    });
  }

  // Kullanıcı bulunamasa da aynı yanıt — e-posta numaralandırma saldırısını önler
  return apiOk({ sent: true });
}

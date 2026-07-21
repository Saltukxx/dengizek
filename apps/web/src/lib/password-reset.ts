// ---------------------------------------------------------------------------
// Şifremi unuttum — token her zaman hash'lenmiş saklanır (bkz. inquiry portal token)
// ---------------------------------------------------------------------------

import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { usersTable } from "@/lib/db/schema";

export const RESET_TOKEN_MINUTES = 60;

export function generateResetToken() {
  return randomBytes(32).toString("base64url");
}

export function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function resetTokenExpiry() {
  return new Date(Date.now() + RESET_TOKEN_MINUTES * 60_000);
}

/** Kullanıcı için yeni sıfırlama token'ı üretir, hash'ini kaydeder, ham token'ı döner. */
export async function issueResetToken(db: Db, userId: string): Promise<string> {
  const token = generateResetToken();
  await db
    .update(usersTable)
    .set({
      resetTokenHash: hashResetToken(token),
      resetTokenExpiresAt: resetTokenExpiry(),
    })
    .where(eq(usersTable.id, userId));
  return token;
}

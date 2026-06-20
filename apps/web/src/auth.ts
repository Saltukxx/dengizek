// ---------------------------------------------------------------------------
// Auth.js v5 — Node tarafı (Credentials provider + DB erişimi)
// JWT stratejisi kullanıldığından adapter gerekmez.
// ---------------------------------------------------------------------------

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { getDb } from "@/lib/db";
import { usersTable } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/password";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Giriş denemesi sınırlayıcı (in-memory MVP) — IP+e-posta başına 10 deneme/10dk
// ---------------------------------------------------------------------------
const loginAttempts = new Map<string, { count: number; resetTime: number }>();

function checkLoginRateLimit(key: string): boolean {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const limit = 10;

  let record = loginAttempts.get(key);
  if (!record || record.resetTime < now) {
    record = { count: 0, resetTime: now + windowMs };
    loginAttempts.set(key, record);
  }
  if (record.count >= limit) return false;
  record.count += 1;
  return true;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "E-posta ile giriş",
      credentials: {
        email: { label: "E-posta", type: "email" },
        password: { label: "Şifre", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase().trim();
        if (!checkLoginRateLimit(email)) {
          // Auth.js authorize null dönerse genel hata gösterilir;
          // brute-force'a karşı sessizce reddediyoruz.
          return null;
        }

        const db = getDb();
        const [user] = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.email, email))
          .limit(1);

        if (!user || !user.isActive) return null;

        const valid = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
});

// ---------------------------------------------------------------------------
// Auth.js v5 — edge-güvenli yapılandırma
// Bu dosya middleware (edge runtime) tarafından import edilir; bu yüzden
// DB, bcrypt veya Node-özel modüller BURADA KULLANILMAZ. Credentials
// provider'ı src/auth.ts içinde (Node tarafı) eklenir.
// ---------------------------------------------------------------------------

import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/giris",
  },
  session: {
    strategy: "jwt",
    // 7 gün — tokenVersion kontrolü (guards.ts) şifre/rol değişiminde zaten
    // anında geçersiz kılar; maxAge üst sınırı belirler.
    maxAge: 7 * 24 * 60 * 60,
  },
  providers: [
    // Boş bırakıldı — Credentials provider yalnızca src/auth.ts'te tanımlanır.
  ],
  callbacks: {
    /**
     * Middleware yetki kontrolü:
     *  - /admin/**     → yalnızca role === "admin"
     *  - /dashboard/** → oturum açmış herkes (admin dahil)
     * Yetkisiz manager /admin'e girerse /dashboard'a yönlendirilir.
     */
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const user = auth?.user;

      if (pathname.startsWith("/admin")) return user?.role === "admin";

      if (pathname.startsWith("/dashboard")) {
        return !!user;
      }

      return true;
    },
    /** Giriş anında kullanıcı kimliği ve rolü token'a yazılır. */
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.tokenVersion = user.tokenVersion;
      }
      return token;
    },
    /** Token'daki kimlik/rol oturum nesnesine taşınır. */
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "admin" | "manager";
        session.user.tokenVersion = token.tokenVersion as number;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

// ---------------------------------------------------------------------------
// Middleware — /admin ve /dashboard rotalarını korur
// Edge runtime'da çalışır; yalnızca edge-güvenli auth.config kullanılır.
// Yetki mantığı: src/auth.config.ts → callbacks.authorized
// ---------------------------------------------------------------------------

import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*"],
};

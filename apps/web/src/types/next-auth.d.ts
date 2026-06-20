// ---------------------------------------------------------------------------
// Auth.js tip genişletmeleri — oturumda id ve rol taşınır
// ---------------------------------------------------------------------------

import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: "admin" | "manager";
  }

  interface Session {
    user: {
      id: string;
      role: "admin" | "manager";
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "admin" | "manager";
  }
}

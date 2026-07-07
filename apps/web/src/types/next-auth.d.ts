// ---------------------------------------------------------------------------
// Auth.js tip genişletmeleri — oturumda id ve rol taşınır
// ---------------------------------------------------------------------------

import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: "admin" | "manager";
    tokenVersion: number;
  }

  interface Session {
    user: {
      id: string;
      role: "admin" | "manager";
      tokenVersion: number;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "admin" | "manager";
    tokenVersion?: number;
  }
}

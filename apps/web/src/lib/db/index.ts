// ---------------------------------------------------------------------------
// Drizzle DB client
// - Neon / uzak Postgres → HTTP (Neon serverless)
// - localhost / Docker postgres → postgres.js (TCP)
// ---------------------------------------------------------------------------

import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = ReturnType<typeof buildDb>;

function isLocalDatabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url.replace(/^postgres(ql)?:/, "http:"));
    const host = parsed.hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "postgres";
  } catch {
    return false;
  }
}

function buildDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("[db] DATABASE_URL ortam değişkeni tanımlı değil.");
  if (isLocalDatabaseUrl(url)) {
    const client = postgres(url, { max: 10 });
    return drizzlePostgres(client, { schema });
  }
  return drizzleNeon(neon(url), { schema });
}

// Sunucu-tarafı singleton (module cache)
let _db: Db | null = null;

export function getDb(): Db {
  if (!_db) _db = buildDb();
  return _db;
}

/** DATABASE_URL tanımlı mı? (DB olmadan mock'a düşmek için) */
export function isDbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

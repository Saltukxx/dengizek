// ---------------------------------------------------------------------------
// Drizzle DB client — Neon Serverless (HTTP transport)
// ---------------------------------------------------------------------------

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type Db = ReturnType<typeof buildDb>;

function buildDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("[db] DATABASE_URL ortam değişkeni tanımlı değil.");
  return drizzle(neon(url), { schema });
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

// ---------------------------------------------------------------------------
// Drizzle DB client
// - Neon / uzak Postgres → Pool (WebSocket, transaction destekli)
// - localhost / Docker postgres → postgres.js (TCP, transaction destekli)
// ---------------------------------------------------------------------------

import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import ws from "ws";
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
  neonConfig.webSocketConstructor = ws;
  const pool = new Pool({ connectionString: url });
  return drizzleNeon(pool, { schema });
}

let _db: Db | null = null;

export function getDb(): Db {
  if (!_db) _db = buildDb();
  return _db;
}

export function isDbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

/** Transaction callback'inde kullanılan DB tipi. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

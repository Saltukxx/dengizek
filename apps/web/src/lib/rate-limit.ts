// ---------------------------------------------------------------------------
// Hız sınırlayıcı — DB-backed (Postgres) + in-memory fallback (dev / DB yok)
// ---------------------------------------------------------------------------

import { sql } from "drizzle-orm";
import { getDb, isDbConfigured } from "@/lib/db";
import { rateLimitBucketsTable } from "@/lib/db/schema";

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const memoryBuckets = new Map<string, Map<string, RateLimitRecord>>();

export interface RateLimitOptions {
  name: string;
  windowMs: number;
  limit: number;
}

export function requestIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function checkRateLimitMemory(key: string, options: RateLimitOptions): boolean {
  const now = Date.now();
  let bucket = memoryBuckets.get(options.name);
  if (!bucket) {
    bucket = new Map();
    memoryBuckets.set(options.name, bucket);
  }

  if (bucket.size > 10_000) {
    for (const [k, rec] of bucket) {
      if (rec.resetTime < now) bucket.delete(k);
    }
  }

  let record = bucket.get(key);
  if (!record || record.resetTime < now) {
    record = { count: 0, resetTime: now + options.windowMs };
    bucket.set(key, record);
  }

  if (record.count >= options.limit) return false;
  record.count += 1;
  return true;
}

async function checkRateLimitDb(key: string, options: RateLimitOptions): Promise<boolean> {
  const db = getDb();
  const now = new Date();
  const resetAt = new Date(now.getTime() + options.windowMs);

  const rows = await db
    .insert(rateLimitBucketsTable)
    .values({
      bucketKey: key,
      name: options.name,
      count: 1,
      resetAt,
    })
    .onConflictDoUpdate({
      target: [rateLimitBucketsTable.bucketKey, rateLimitBucketsTable.name],
      set: {
        count: sql`CASE
          WHEN ${rateLimitBucketsTable.resetAt} < ${now}
          THEN 1
          ELSE ${rateLimitBucketsTable.count} + 1
        END`,
        resetAt: sql`CASE
          WHEN ${rateLimitBucketsTable.resetAt} < ${now}
          THEN ${resetAt}
          ELSE ${rateLimitBucketsTable.resetAt}
        END`,
      },
    })
    .returning();

  const row = rows[0];
  if (!row) return true;
  return row.count <= options.limit;
}

/** true → istek kabul; false → limit aşıldı. */
export async function checkRateLimit(key: string, options: RateLimitOptions): Promise<boolean> {
  if (!isDbConfigured()) {
    return checkRateLimitMemory(key, options);
  }
  try {
    return await checkRateLimitDb(key, options);
  } catch (err) {
    console.warn("[rate-limit] DB hatası, bellek fallback:", err);
    return checkRateLimitMemory(key, options);
  }
}

/** Eski senkron imza — yalnızca test/bellek modu. */
export function checkRateLimitSync(key: string, options: RateLimitOptions): boolean {
  return checkRateLimitMemory(key, options);
}

/** Süresi dolmuş kova temizliği (opsiyonel cron). */
export async function pruneExpiredRateLimits(): Promise<void> {
  if (!isDbConfigured()) return;
  const db = getDb();
  await db
    .delete(rateLimitBucketsTable)
    .where(sql`${rateLimitBucketsTable.resetAt} < now()`);
}

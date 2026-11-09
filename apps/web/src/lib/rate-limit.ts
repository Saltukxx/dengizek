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
  /**
   * true → DB hatasında istek REDDEDİLİR (fail closed). Bellek fallback'i
   * örnek başına saydığından gerçek limit ~örnek sayısı kadar katlanır;
   * kötüye kullanım/maliyet hassas uçlarda (login, chat) kapalı kalmak
   * daha güvenlidir. Varsayılan false (kullanılabilirlik öncelikli).
   */
  failClosed?: boolean;
}

/**
 * İsteği yapan IP — hız sınırı ve kötüye kullanım anahtarı.
 *
 * GÜVENLİK: Bu değer yalnızca uygulamanın ÖNÜNDE güvenilir bir ters vekil
 * (nginx) varsa ve istemci uygulamaya doğrudan erişemiyorsa güvenilirdir
 * (bkz. deploy önizleme/üretim nginx; uygulama host portu yayınlamaz). nginx her istekte
 * `X-Real-IP`'yi gerçek bağlanan adresle (`$remote_addr`) EZDİĞİ için önce o
 * okunur; istemci kendi gönderse de nginx üzerine yazar.
 *
 * `X-Forwarded-For` istemci tarafından uydurulabilir: nginx gerçek adresi
 * zincirin SONUNA eklediğinden ilk değil SON değer alınır — baştaki uydurma
 * girdiler yok sayılır, böylece sahte başlıkla hız sınırı aşılamaz.
 */
export function requestIp(req: Request): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }

  return "unknown";
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
  const resetAt = new Date(Date.now() + options.windowMs);

  // Pencere sınırı SQL tarafında hesaplanır. Raw sql`` şablonuna JS Date
  // gömmek postgres.js sürücüsünde patlar (kolon tipi bilgisi olmadığı için
  // Date'i serileştiremez) — bu da failClosed uçlarda (login, chat) her isteği
  // reddeder. .values() içindeki Date sorunsuz: orada kolon tipi biliniyor.
  const windowExpr = sql`now() + ${options.windowMs} * interval '1 millisecond'`;

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
          WHEN ${rateLimitBucketsTable.resetAt} < now()
          THEN 1
          ELSE ${rateLimitBucketsTable.count} + 1
        END`,
        resetAt: sql`CASE
          WHEN ${rateLimitBucketsTable.resetAt} < now()
          THEN ${windowExpr}
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
/**
 * Yalnız geliştirmede: RATE_LIMIT_MEMORY=true → sayaçlar bellekte. Yerel
 * sunucu canlı veritabanına salt okunur bağlıyken (iOS testi) sayaç
 * yazılamadığı için fail-closed uçlar (rehber, giriş) her isteği reddederdi.
 * Production'da yok sayılır.
 */
function memoryOnlyForDev(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.RATE_LIMIT_MEMORY === "true";
}

export async function checkRateLimit(key: string, options: RateLimitOptions): Promise<boolean> {
  if (!isDbConfigured() || memoryOnlyForDev()) {
    return checkRateLimitMemory(key, options);
  }
  try {
    return await checkRateLimitDb(key, options);
  } catch (err) {
    if (options.failClosed) {
      console.warn("[rate-limit] DB hatası, fail-closed reddedildi:", err);
      return false;
    }
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

// ---------------------------------------------------------------------------
// In-memory hız sınırlayıcı (MVP) — chat, inquiry ve login'de ortak kullanılır.
// Uyarı: tek süreçte çalışır; çok-instance üretimde Redis benzeri bir
// depoya taşınmalıdır.
// ---------------------------------------------------------------------------

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const buckets = new Map<string, Map<string, RateLimitRecord>>();

export interface RateLimitOptions {
  /** Sınırlayıcı adı — her ad ayrı kova kullanır ("chat", "inquiry"...) */
  name: string;
  /** Pencere süresi (ms) */
  windowMs: number;
  /** Pencere başına istek limiti */
  limit: number;
}

/** true → istek kabul; false → limit aşıldı. */
export function checkRateLimit(key: string, options: RateLimitOptions): boolean {
  const now = Date.now();
  let bucket = buckets.get(options.name);
  if (!bucket) {
    bucket = new Map();
    buckets.set(options.name, bucket);
  }

  // Basit temizlik — süresi geçen kayıtları ayıkla (kova büyümesin)
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

/** İsteğin IP'sini başlıklardan çözer (proxy arkasında x-forwarded-for). */
export function requestIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

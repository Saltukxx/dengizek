import { timingSafeEqual } from "node:crypto";
import { apiFail, apiOk } from "@/lib/api-response";
import { cleanupMediaObjects } from "@/lib/media-cleanup";
import { pruneExpiredRateLimits } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || provided.length !== expected.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
    return apiFail("Yetkisiz.", 401);
  }
  // Aynı cron'a iliştirilmiş hafif bakım: süresi dolan rate-limit kovaları
  // temizlenir ki tablo sınırsız büyümesin. Hata medya temizliğini kırmasın.
  await pruneExpiredRateLimits().catch((err) =>
    console.warn("[media-cleanup] rate-limit prune başarısız:", err),
  );
  return apiOk(await cleanupMediaObjects());
}

export const GET = POST;

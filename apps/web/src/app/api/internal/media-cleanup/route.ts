import { timingSafeEqual } from "node:crypto";
import { apiFail, apiOk } from "@/lib/api-response";
import { cleanupMediaObjects, pruneStaleGuestSessions } from "@/lib/media-cleanup";
import { pruneExpiredRateLimits } from "@/lib/rate-limit";
import { pruneAiConversationText } from "@/lib/ai/conversation-retention";

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || provided.length !== expected.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
    return apiFail("Yetkisiz.", 401);
  }
  // Aynı cron'a iliştirilmiş hafif bakım: süresi dolan rate-limit kovaları ve
  // eskimiş anonim misafir oturumları temizlenir ki tablolar sınırsız
  // büyümesin. Hataları medya temizliğini kırmasın.
  await pruneExpiredRateLimits().catch((err) =>
    console.warn("[media-cleanup] rate-limit prune başarısız:", err),
  );
  const guestSessionsPruned = await pruneStaleGuestSessions().catch((err) => {
    console.warn("[media-cleanup] guest_sessions prune başarısız:", err);
    return 0;
  });
  // Yapay zekâ konuşma metinleri 90 gün sonra silinir (sayılar kalır).
  const aiTextPruned = await pruneAiConversationText().catch((err) => {
    console.warn("[media-cleanup] AI metin saklama temizliği başarısız:", err);
    return 0;
  });
  return apiOk({ ...(await cleanupMediaObjects()), guestSessionsPruned, aiTextPruned });
}

export const GET = POST;

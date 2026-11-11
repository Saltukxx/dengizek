// ---------------------------------------------------------------------------
// GET /api/v1/hotels/{slug}/tours/{tourId} — iOS uygulaması video turu.
// Video adresleri istek anında imzalanır; uygulama mediaTokenExpiresAt
// yaklaşınca aynı uç noktayı yeniden çağırır.
// ---------------------------------------------------------------------------

import { apiNotFound, apiOk, apiRateLimited } from "@/lib/api-response";
import { isDbConfigured } from "@/lib/db";
import { getPublishedManifest } from "@/lib/db/manifest";
import { getPublishedHotelBySlug } from "@/lib/hotels-repo";
import { toMobileTour } from "@/lib/mobile-api/v1";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string; tourId: string }> }) {
  const { slug, tourId } = await params;
  if (!isDbConfigured()) return apiNotFound("Tur bulunamadı.");
  if (!(await checkRateLimit(requestIp(req), { name: "v1-tour", windowMs: 60_000, limit: 60 }))) {
    return apiRateLimited();
  }
  // Askıdaki/yayında olmayan otelin turu da görünmez.
  if (!(await getPublishedHotelBySlug(slug))) return apiNotFound("Tur bulunamadı.");
  const manifest = await getPublishedManifest(slug, tourId);
  if (!manifest) return apiNotFound("Tur bulunamadı.");
  return apiOk({ tour: toMobileTour(manifest) });
}

// ---------------------------------------------------------------------------
// GET /api/tour/playback-token?hotelSlug=&tourId=
//
// Taze imzalı medya URL'leri döner. Oynatıcı, manifestteki
// mediaTokenExpiresAt'e bakıp süre dolmadan önce burayı çağırır — uzun turda
// imza ortada ölüp video kırılmasın diye (ana planın kabul kriteri).
//
// Kimlik doğrulama yok: tur zaten herkese açık. Yetkilendirme yayın
// görünürlüğüdür — askıya alınmış/yayımlanmamış otel için token üretilmez.
// ---------------------------------------------------------------------------

import { getPublishedManifest } from "@/lib/db/manifest";
import { isDbConfigured } from "@/lib/db";
import { buildSignedSourceMap } from "@/lib/bunny/sign-manifest";
import { isBunnySigningConfigured } from "@/lib/bunny/sign";
import { getPublishedHotelBySlug } from "@/lib/hotels-repo";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { apiFail, apiNotFound, apiOk, apiRateLimited } from "@/lib/api-response";

export async function GET(req: Request) {
  if (!isDbConfigured()) return apiNotFound("Tur bulunamadı.");

  // Fail-open: imza yenilemesi engellenirse video kırılır, bu yüzden DB
  // hatasında isteği reddetmeyiz (chat/login gibi maliyet-hassas uç değil).
  if (
    !(await checkRateLimit(requestIp(req), {
      name: "playback-token",
      windowMs: 60_000,
      limit: 60,
    }))
  ) {
    return apiRateLimited();
  }

  const url = new URL(req.url);
  const hotelSlug = url.searchParams.get("hotelSlug");
  const tourId = url.searchParams.get("tourId");
  if (!hotelSlug || !tourId) {
    return apiFail("hotelSlug ve tourId gerekli.", 400);
  }

  // Varlık kontrolü imzalama açık/kapalı fark etmeksizin yapılır — sözleşme
  // tek biçimli kalsın: olmayan/askıdaki tur her durumda 404.
  const hotel = await getPublishedHotelBySlug(hotelSlug);
  if (!hotel) return apiNotFound("Tur bulunamadı.");

  // getPublishedManifest zaten imzalı döner; kaynak haritasını ondan çıkarırız.
  const manifest = await getPublishedManifest(hotelSlug, tourId);
  if (!manifest) return apiNotFound("Tur bulunamadı.");

  // İmzalama kapalıysa yenilenecek bir şey yok — istemci de denememeli.
  if (!isBunnySigningConfigured()) {
    return apiOk({ signing: false, sources: {}, mediaTokenExpiresAt: null });
  }

  const { sources, mediaTokenExpiresAt } = buildSignedSourceMap(manifest);
  return apiOk({ signing: true, sources, mediaTokenExpiresAt });
}

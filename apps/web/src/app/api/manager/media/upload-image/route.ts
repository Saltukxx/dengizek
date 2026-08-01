// ---------------------------------------------------------------------------
// POST /api/manager/media/upload-image — otel kapsamlı yerel görsel yükleme
// ---------------------------------------------------------------------------

import { requireHotelAccess } from "@/lib/auth/guards";
import { apiFail, apiOk } from "@/lib/api-response";
import { hasSafeImageDimensions, hasValidImageSignature, storeImage } from "@/lib/object-storage";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(req: Request) {
  const requestUrl = new URL(req.url);
  const hotelIdFromQuery = requestUrl.searchParams.get("hotelId");

  const form = await req.formData().catch(() => null);
  const hotelId = (form?.get("hotelId") as string | null) ?? hotelIdFromQuery;

  if (!hotelId) {
    return apiFail("hotelId gerekli.", 400);
  }

  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const file = form?.get("file");
  if (!(file instanceof File)) {
    return apiFail("Dosya gerekli.", 400);
  }
  if (!ALLOWED.has(file.type)) {
    return apiFail("Desteklenmeyen dosya türü.", 400);
  }
  if (file.size > MAX_BYTES) {
    return apiFail("Dosya en fazla 5 MB olabilir.", 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!hasValidImageSignature(file.type, buffer)) return apiFail("Dosya içeriği görsel türüyle eşleşmiyor.", 400);
  // Küçük dosya, devasa çözünürlük ("piksel bombası") — boyut sınırı yakalamaz.
  if (!hasSafeImageDimensions(file.type, buffer)) {
    return apiFail("Görsel çözünürlüğü çok yüksek (en fazla 20.000 piksel kenar / 50 MP).", 400);
  }
  let stored: { url: string; key: string };
  try {
    stored = await storeImage(guard.hotel.id, file.type, buffer);
  } catch (err) {
    console.error("[media] görsel depolama hatası:", err);
    return apiFail("Görsel depolama servisi kullanılamıyor.", 503, { code: "STORAGE_UNAVAILABLE" });
  }

  return apiOk({ url: stored.url, objectKey: stored.key });
}

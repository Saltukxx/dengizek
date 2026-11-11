// ---------------------------------------------------------------------------
// GET /api/v1/hotels/{slug} — iOS uygulaması otel sayfası.
// ---------------------------------------------------------------------------

import { apiNotFound, apiOk } from "@/lib/api-response";
import {
  getPublishedHotelBySlug,
  getPublishedHotelContent,
  getPublishedHotelsForBrowse,
  getPublishedReviews,
  getPublishedTours,
} from "@/lib/hotels-repo";
import { toMobileHotelDetail } from "@/lib/mobile-api/v1";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const hotel = await getPublishedHotelBySlug(slug);
  if (!hotel) return apiNotFound("Otel bulunamadı.");
  // Fiyat ve yıldız kartla aynı kaynaktan: önbellekteki liste satırı.
  const [content, tours, rows, reviews] = await Promise.all([
    getPublishedHotelContent(slug),
    getPublishedTours(slug),
    getPublishedHotelsForBrowse(),
    getPublishedReviews(slug),
  ]);
  const card = rows.find((row) => row.slug === slug) ?? null;
  return apiOk({ hotel: toMobileHotelDetail(hotel, content, tours, card, reviews) });
}

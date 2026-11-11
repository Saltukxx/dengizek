// ---------------------------------------------------------------------------
// GET /api/v1/hotels/{slug}/quote?giris=&cikis=&yetiskin=&cocuk= — seçilen
// tarih ve kişi için oda oda toplam fiyat. Web otel sayfasındaki hesaplayıcıyla
// aynı hesap (quoteStay): her gece kendi dönemi/kampanyasıyla, stop sale ve
// minimum konaklama dahil. Tarih hatası 200 + `error` ile döner; uygulama
// misafire mesajı gösterir.
// ---------------------------------------------------------------------------

import { apiNotFound, apiOk } from "@/lib/api-response";
import { getPublishedHotelBySlug, getPublishedHotelContent } from "@/lib/hotels-repo";
import { toMobileStayQuote } from "@/lib/mobile-api/v1";
import { todayIso } from "@/lib/price";
import { loadQuotePricing } from "@/lib/quote-pricing";
import { parseStaySearch, quoteStay } from "@/lib/stay-search";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const hotel = await getPublishedHotelBySlug(slug);
  if (!hotel) return apiNotFound("Otel bulunamadı.");
  const stay = parseStaySearch(new URL(req.url).searchParams);
  if (!stay.checkIn || !stay.checkOut) return apiOk({ quote: null, error: "Giriş ve çıkış tarihi seçin." });
  const content = await getPublishedHotelContent(slug);
  const quote = quoteStay(await loadQuotePricing(slug, content), stay, todayIso());
  if (!quote.ok) return apiOk({ quote: null, error: quote.error });
  return apiOk({ quote: toMobileStayQuote(quote, stay), error: null });
}

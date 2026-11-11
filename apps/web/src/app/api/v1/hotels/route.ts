// ---------------------------------------------------------------------------
// GET /api/v1/hotels — iOS uygulaması otel listesi.
// season=termal|yaz|kis, q, stars, tur, kampanya, pets, price, sort ve
// konaklama (giris, cikis, yetiskin, cocuk): web vitriniyle aynı süzgeç
// (lib/browse-filters). Veri, vitrinlerle aynı önbellekli kaynaktan gelir;
// askıdaki ve yayında olmayan oteller burada da görünmez.
// ---------------------------------------------------------------------------

import { apiOk } from "@/lib/api-response";
import { filterBrowseHotels } from "@/lib/browse-filters";
import { getPublishedHotelsForBrowse } from "@/lib/hotels-repo";
import { parseMobileBrowseFilters, parseMobileSeason, toMobileHotelCard } from "@/lib/mobile-api/v1";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const season = parseMobileSeason(url.searchParams.get("season"));
  const filters = parseMobileBrowseFilters(url.searchParams);
  const rows = await getPublishedHotelsForBrowse({ season, q: filters.q?.toLowerCase() });
  return apiOk({ hotels: filterBrowseHotels(rows, filters).map(toMobileHotelCard) });
}

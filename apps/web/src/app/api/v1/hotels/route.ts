// ---------------------------------------------------------------------------
// GET /api/v1/hotels?season=termal|yaz|kis&q= — iOS uygulaması otel listesi.
// Veri, web vitrinleriyle aynı önbellekli kaynaktan gelir; askıdaki ve
// yayında olmayan oteller burada da görünmez.
// ---------------------------------------------------------------------------

import { apiOk } from "@/lib/api-response";
import { getPublishedHotelsForBrowse } from "@/lib/hotels-repo";
import { parseMobileSeason, toMobileHotelCard } from "@/lib/mobile-api/v1";

const MAX_QUERY_CHARS = 100;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const season = parseMobileSeason(url.searchParams.get("season"));
  const q = url.searchParams.get("q")?.trim().slice(0, MAX_QUERY_CHARS) || undefined;
  const rows = await getPublishedHotelsForBrowse({ season, q });
  return apiOk({ hotels: rows.map(toMobileHotelCard) });
}

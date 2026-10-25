// ---------------------------------------------------------------------------
// GET /api/search/hotels?q=… — otel arama asistanı (modelsiz, kural tabanlı).
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { searchHotelsSmart } from "@/lib/ai/search-interpret";
import { getHotelSearchIndex } from "@/lib/hotel-search-index";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { apiRateLimited } from "@/lib/api-response";
import { trackEvent } from "@/lib/analytics";
import { SEARCH_EVENT, searchLogPayload } from "@/lib/ai/search-log";

const MAX_QUERY = 200;

export async function GET(req: Request) {
  if (!(await checkRateLimit(requestIp(req), { name: "hotel-search", windowMs: 60_000, limit: 30 }))) {
    return apiRateLimited();
  }
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, MAX_QUERY) ?? "";
  if (!q) return NextResponse.json({ ok: false, error: "Arama metni gerekli" }, { status: 400 });
  // Takip sorusu bağlamı: önceki aramalar (?ctx=…&ctx=…), en fazla 5.
  const context = new URL(req.url).searchParams.getAll("ctx").map((c) => c.trim().slice(0, MAX_QUERY)).filter(Boolean).slice(-5);
  const response = await searchHotelsSmart(q, await getHotelSearchIndex(), context);
  void trackEvent(SEARCH_EVENT, { ...searchLogPayload(q, response) });
  return NextResponse.json({ ok: true, ...response });
}

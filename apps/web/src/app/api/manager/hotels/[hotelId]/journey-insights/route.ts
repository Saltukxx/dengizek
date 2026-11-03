// ---------------------------------------------------------------------------
// GET /api/manager/hotels/[hotelId]/journey-insights?period=30 — otelin kendi
// tur çıkışları, soru → talep dönüşümü ve rehber özeti. Ham konuşma kaydı ve
// ziyaret ayrıntısı yalnız adminde.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth/guards";
import { loadJourneyInsights, periodFromUrl } from "@/lib/journey-data";

type RouteParams = { params: Promise<{ hotelId: string }> };

export async function GET(req: Request, { params }: RouteParams) {
  const { hotelId } = await params;
  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const { periodDays, since } = periodFromUrl(new URL(req.url));
  return NextResponse.json({ ok: true, periodDays, ...(await loadJourneyInsights(since, guard.hotel.id)) });
}

// ---------------------------------------------------------------------------
// GET /api/admin/journey-insights?period=30&hotelId=… — tur çıkışları,
// soru → talep dönüşümü ve yapay zekâ özeti (tüm oteller ya da tek otel).
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guards";
import { loadJourneyInsights, periodFromUrl } from "@/lib/journey-data";

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const url = new URL(req.url);
  const { periodDays, since } = periodFromUrl(url);
  const hotelId = url.searchParams.get("hotelId");
  return NextResponse.json({ ok: true, periodDays, ...(await loadJourneyInsights(since, hotelId)) });
}

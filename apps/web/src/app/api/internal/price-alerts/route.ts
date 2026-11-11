// ---------------------------------------------------------------------------
// POST/GET /api/internal/price-alerts — iOS "fiyat düşünce haber ver" cron'u
// (günde bir). Yetki deseni ical-sync ile aynı: CRON_SECRET + sabit-zamanlı
// karşılaştırma.
// ---------------------------------------------------------------------------

import { timingSafeEqual } from "node:crypto";
import { apiFail, apiOk, apiServiceUnavailable } from "@/lib/api-response";
import { getDb, isDbConfigured } from "@/lib/db";
import { runPriceAlerts } from "@/lib/push/price-alerts";

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (
    !expected ||
    provided.length !== expected.length ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  ) {
    return apiFail("Yetkisiz.", 401);
  }
  if (!isDbConfigured()) return apiServiceUnavailable("Veritabanı yapılandırılmamış.");

  const run = await runPriceAlerts(getDb());
  return apiOk({ ...run });
}

export const GET = POST;

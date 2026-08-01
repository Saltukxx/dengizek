// ---------------------------------------------------------------------------
// POST/GET /api/internal/ical-sync — kanal takvimlerini envantere işleyen cron.
// Yetki deseni media-cleanup ile aynı: CRON_SECRET + sabit-zamanlı karşılaştırma.
// ---------------------------------------------------------------------------

import { timingSafeEqual } from "node:crypto";
import { apiFail, apiOk } from "@/lib/api-response";
import { syncIcalFeeds } from "@/lib/ical/import";

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

  const results = await syncIcalFeeds();
  return apiOk({
    feeds: results.length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}

export const GET = POST;

// ---------------------------------------------------------------------------
// POST/GET /api/internal/ical-sync — kanal takvimlerini envantere işleyen ve
// envanter ufkunu ileri taşıyan cron.
// Yetki deseni media-cleanup ile aynı: CRON_SECRET + sabit-zamanlı karşılaştırma.
// ---------------------------------------------------------------------------

import { timingSafeEqual } from "node:crypto";
import { apiFail, apiOk } from "@/lib/api-response";
import { syncIcalFeeds } from "@/lib/ical/import";
import { extendInventoryHorizon } from "@/lib/inventory-seed";

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

  // Envanter ufku: oda oluşturulurken tohumlanan 18 ay her gün ileri taşınır.
  const horizonRows = await extendInventoryHorizon().catch((error) => {
    console.error("[ical-sync] envanter ufku uzatılamadı", error);
    return 0;
  });

  const results = await syncIcalFeeds();
  return apiOk({
    horizonRows,
    feeds: results.length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}

export const GET = POST;

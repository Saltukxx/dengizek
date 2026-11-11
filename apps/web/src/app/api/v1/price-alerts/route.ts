// ---------------------------------------------------------------------------
// POST / DELETE /api/v1/price-alerts — iOS: kaydedilen otelde "fiyat düşünce
// haber ver". Misafirin hesabı yok; cihaz kimliği otele bağlanır. Bildirim
// yalnız herkese açık fiyatı taşır, kişisel içerik yoktur.
// ---------------------------------------------------------------------------

import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { apiFail, apiNotFound, apiOk, apiRateLimited, apiServiceUnavailable, validationMessage } from "@/lib/api-response";
import { getDb, isDbConfigured } from "@/lib/db";
import { hotelsTable, priceAlertTargetsTable } from "@/lib/db/schema";
import { guestVisibleHotelBySlugWhere } from "@/lib/hotel-visibility";
import { getPublishedHotelsForBrowse } from "@/lib/hotels-repo";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";

/** Bir cihaz en fazla bu kadar otel için bildirim alabilir. */
const MAX_HOTELS_PER_DEVICE = 100;

const priceAlertSchema = z.object({
  hotelSlug: z.string().min(1).max(120),
  deviceToken: z.string().regex(/^[0-9a-f]{64,200}$/i, "Geçersiz cihaz kimliği."),
  environment: z.enum(["sandbox", "production"]),
});

async function parse(req: Request) {
  if (!isDbConfigured()) return { error: apiServiceUnavailable("Bildirim kaydı yapılandırılmamış.") } as const;
  // Kaydedilen her otel için bir istek gelir; ilk açılışta liste toplu yollanır.
  if (!(await checkRateLimit(requestIp(req), { name: "price-alerts", windowMs: 60_000, limit: 120 }))) {
    return { error: apiRateLimited() } as const;
  }
  const parsed = priceAlertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return { error: apiFail(validationMessage(parsed.error), 400) } as const;
  return { data: { ...parsed.data, deviceToken: parsed.data.deviceToken.toLowerCase() } } as const;
}

export async function POST(req: Request) {
  const input = await parse(req);
  if ("error" in input) return input.error;
  const { hotelSlug, deviceToken, environment } = input.data;

  const db = getDb();
  const [hotel] = await db.select({ id: hotelsTable.id }).from(hotelsTable).where(guestVisibleHotelBySlugWhere(hotelSlug)).limit(1);
  if (!hotel) return apiNotFound("Otel bulunamadı.");

  const [existing] = await db
    .select({ total: count() })
    .from(priceAlertTargetsTable)
    .where(eq(priceAlertTargetsTable.deviceToken, deviceToken));
  if (Number(existing?.total ?? 0) >= MAX_HOTELS_PER_DEVICE) {
    return apiFail("Bu cihaz için fiyat bildirimi alınan otel sayısı doldu.", 409);
  }

  // Başlangıç fiyatı: kartla aynı kaynak. Sonraki düşüşler buna göre ölçülür.
  const rows = await getPublishedHotelsForBrowse();
  const lastPriceMinor = rows.find((row) => row.slug === hotelSlug)?.minPriceMinor ?? null;

  await db
    .insert(priceAlertTargetsTable)
    .values({ hotelId: hotel.id, deviceToken, environment, lastPriceMinor })
    .onConflictDoNothing();
  return apiOk({});
}

export async function DELETE(req: Request) {
  const input = await parse(req);
  if ("error" in input) return input.error;
  const { hotelSlug, deviceToken } = input.data;

  const db = getDb();
  // Görünürlük aranmaz: yayından kalkan otelin kaydı da silinebilmeli.
  const [hotel] = await db.select({ id: hotelsTable.id }).from(hotelsTable).where(eq(hotelsTable.slug, hotelSlug)).limit(1);
  if (hotel) {
    await db
      .delete(priceAlertTargetsTable)
      .where(and(eq(priceAlertTargetsTable.hotelId, hotel.id), eq(priceAlertTargetsTable.deviceToken, deviceToken)));
  }
  return apiOk({});
}

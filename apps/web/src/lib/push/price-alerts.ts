// ---------------------------------------------------------------------------
// iOS "fiyat düşünce haber ver": kaydedilen otelin "gecelik başlayan" fiyatı
// düşünce cihaza bildirim. Günlük cron çalıştırır; başarısızlık fırlatmaz.
// ---------------------------------------------------------------------------

import { eq } from "drizzle-orm";
import type { getDb } from "@/lib/db";
import { hotelsTable, priceAlertTargetsTable } from "@/lib/db/schema";
import { getPublishedHotelsForBrowse } from "@/lib/hotels-repo";
import { apnsConfigFromEnv, sendApns, type ApnsAlert, type ApnsEnvironment } from "./apns";

type Db = ReturnType<typeof getDb>;

/** Bundan küçük düşüşler (kur/yuvarlama oynaması) bildirilmez. */
export const PRICE_DROP_MIN_RATIO = 0.05;
/** Aynı otel için aynı cihaza en sık bu aralıkla bildirim gider. */
export const PRICE_ALERT_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface PriceAlertDecision {
  notify: boolean;
  /** Kayda yazılacak yeni "son görülen fiyat". */
  nextPriceMinor: number | null;
}

/**
 * Son görülen fiyata göre karar. Fiyat yoksa (talep üzerine) kayıt aynen kalır;
 * ilk fiyat yalnız kaydedilir. Fiyat her değiştiğinde "son görülen" güncellenir,
 * böylece bildirim hep bir önceki fiyata göre gerçek bir düşüşü anlatır.
 */
export function priceAlertDecision(
  target: { lastPriceMinor: number | null; lastNotifiedAt: Date | null },
  currentMinor: number | null,
  now: Date,
): PriceAlertDecision {
  if (currentMinor == null) return { notify: false, nextPriceMinor: target.lastPriceMinor };
  if (target.lastPriceMinor == null) return { notify: false, nextPriceMinor: currentMinor };
  const dropped = currentMinor <= target.lastPriceMinor * (1 - PRICE_DROP_MIN_RATIO);
  const rested =
    target.lastNotifiedAt == null || now.getTime() - target.lastNotifiedAt.getTime() >= PRICE_ALERT_MIN_INTERVAL_MS;
  return { notify: dropped && rested, nextPriceMinor: currentMinor };
}

const tryFormat = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });

export function priceDropAlert(hotel: { slug: string; name: string }, fromMinor: number, toMinor: number): ApnsAlert {
  return {
    title: "Fiyat düştü",
    body: `${hotel.name}: gecelik başlayan fiyat ${tryFormat.format(fromMinor / 100)} yerine ${tryFormat.format(toMinor / 100)}.`,
    data: { hotelSlug: hotel.slug },
  };
}

export interface PriceAlertRun {
  checked: number;
  sent: number;
  removed: number;
  /** APNs ayarlı değilse fiyatlar yine kaydedilir ama bildirim gitmez. */
  configured: boolean;
}

export async function runPriceAlerts(db: Db, now = new Date()): Promise<PriceAlertRun> {
  const config = apnsConfigFromEnv();
  const run: PriceAlertRun = { checked: 0, sent: 0, removed: 0, configured: config !== null };

  const targets = await db
    .select({
      id: priceAlertTargetsTable.id,
      deviceToken: priceAlertTargetsTable.deviceToken,
      environment: priceAlertTargetsTable.environment,
      lastPriceMinor: priceAlertTargetsTable.lastPriceMinor,
      lastNotifiedAt: priceAlertTargetsTable.lastNotifiedAt,
      slug: hotelsTable.slug,
      name: hotelsTable.name,
    })
    .from(priceAlertTargetsTable)
    .innerJoin(hotelsTable, eq(hotelsTable.id, priceAlertTargetsTable.hotelId));
  if (targets.length === 0) return run;

  // Kartla aynı kaynak: yayındaki, misafire görünen "gecelik başlayan" fiyat.
  const rows = await getPublishedHotelsForBrowse();
  const current = new Map(rows.map((row) => [row.slug, { name: row.name, priceMinor: row.minPriceMinor }]));

  for (const target of targets) {
    run.checked += 1;
    const live = current.get(target.slug);
    // Otel yayından kalktıysa dokunma; geri gelince kaldığı yerden sürer.
    if (!live) continue;
    const decision = priceAlertDecision(target, live.priceMinor, now);

    let notified = false;
    if (decision.notify && config && target.lastPriceMinor != null && live.priceMinor != null) {
      const result = await sendApns(
        config,
        target.deviceToken,
        target.environment as ApnsEnvironment,
        priceDropAlert({ slug: target.slug, name: live.name || target.name }, target.lastPriceMinor, live.priceMinor),
      );
      if (result.ok) {
        notified = true;
        run.sent += 1;
      } else if (result.unregistered) {
        await db.delete(priceAlertTargetsTable).where(eq(priceAlertTargetsTable.id, target.id));
        run.removed += 1;
        continue;
      } else {
        console.warn("[price-alerts] APNs gönderilemedi", { status: result.status, reason: result.reason });
      }
    }

    if (decision.nextPriceMinor !== target.lastPriceMinor || notified) {
      await db
        .update(priceAlertTargetsTable)
        .set({ lastPriceMinor: decision.nextPriceMinor, ...(notified ? { lastNotifiedAt: now } : {}) })
        .where(eq(priceAlertTargetsTable.id, target.id));
    }
  }
  return run;
}

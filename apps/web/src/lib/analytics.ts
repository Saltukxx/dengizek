import { randomBytes } from "node:crypto";
import { getDb, isDbConfigured } from "@/lib/db";
import { analyticsEventsTable } from "@/lib/db/schema";

import type { AnalyticsEventType as KnownAnalyticsEventType } from "@/lib/schemas/analytics";

/**
 * Bilinen olay adları schemas/analytics.ts'ten gelir; serbest string kabul
 * edilmeye devam eder (sunucu tarafı ad-hoc olaylar için), ancak panel
 * ekranları yalnızca bilinen adları etiketleyebilir.
 */
export type AnalyticsEventType = KnownAnalyticsEventType | (string & {});

/**
 * @param visitId anonim ziyaret kimliği (bkz. @/lib/visit-client) — aynı
 *   ziyaretin olaylarını birbirine bağlar; çağıran doğrulanmış değer geçirir.
 */
export async function trackEvent(
  eventType: AnalyticsEventType,
  payload: Record<string, unknown> = {},
  hotelId?: string | null,
  hotelSlug?: string | null,
  visitId?: string | null,
) {
  if (!isDbConfigured()) return;
  try {
    const db = getDb();
    await db.insert(analyticsEventsTable).values({
      hotelId: hotelId ?? null,
      hotelSlug: hotelSlug ?? null,
      eventType,
      payload,
      visitId: visitId ?? null,
    });
  } catch {
    // telemetry must not break UX
  }
}

export function generateAccessToken() {
  return randomBytes(24).toString("hex");
}

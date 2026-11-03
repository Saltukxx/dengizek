"use client";

import { JOURNEY_EVENT_TYPES, type AnalyticsTrackInput } from "@/lib/schemas/analytics";
import { hasAnalyticsConsent } from "@/lib/consent";
import { getVisitId } from "@/lib/visit-client";

/**
 * İstemci analitiği — public API'ye POST.
 *
 * ONAY KAPISI: genel olaylar ziyaretçi açıkça kabul etmeden gönderilmez
 * (bkz. @/lib/consent). Yolculuk olayları (JOURNEY_EVENT_TYPES: tur ilerlemesi
 * ve çıkışı, talep başlangıcı) ürün kararıyla onaydan bağımsız gönderilir.
 * Her olay anonim ziyaret kimliğini taşır (bkz. @/lib/visit-client).
 *
 * keepalive: sayfa kapanırken gönderilen olay (ör. tour_exit) yolda kalmaz.
 */
export async function trackEvent(
  eventType: AnalyticsTrackInput["eventType"],
  payload: Record<string, unknown> = {},
  hotelSlug?: string,
) {
  if (!JOURNEY_EVENT_TYPES.includes(eventType) && !hasAnalyticsConsent()) return;
  try {
    await fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType, payload, hotelSlug, visitId: getVisitId() }),
      keepalive: true,
    });
  } catch {
    // ignore
  }
}

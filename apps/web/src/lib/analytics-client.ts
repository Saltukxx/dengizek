"use client";

import type { AnalyticsTrackInput } from "@/lib/schemas/analytics";
import { hasAnalyticsConsent } from "@/lib/consent";

/**
 * İstemci analitiği — public API'ye POST.
 *
 * ONAY KAPISI: ziyaretçi açıkça kabul etmeden hiçbir olay gönderilmez
 * (bkz. @/lib/consent). Varsayılan reddettir; onay banner'ı olmadan da
 * güvenli tarafta kalırız.
 */
export async function trackEvent(
  eventType: AnalyticsTrackInput["eventType"],
  payload: Record<string, unknown> = {},
  hotelSlug?: string,
) {
  if (!hasAnalyticsConsent()) return;
  try {
    await fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType, payload, hotelSlug }),
    });
  } catch {
    // ignore
  }
}

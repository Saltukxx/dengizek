"use client";

// ---------------------------------------------------------------------------
// Sunucuda render edilen misafir sayfalarına takılan görüntüleme izleyicisi.
//
// Sayfa sunucu bileşeni olduğu için olay istemcide, mount anında gönderilir.
// trackEvent onay kapısına tabidir (bkz. lib/consent) — onay yoksa hiçbir
// istek çıkmaz. `key` değişmediği sürece aynı görüntüleme iki kez sayılmaz.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import type { AnalyticsTrackInput } from "@/lib/schemas/analytics";
import { trackEvent } from "@/lib/analytics-client";

type ViewTrackerProps = {
  eventType: AnalyticsTrackInput["eventType"];
  hotelSlug?: string;
  payload?: Record<string, unknown>;
};

export function ViewTracker({ eventType, hotelSlug, payload }: ViewTrackerProps) {
  // Aynı görüntüleme için tek olay — React 18 çift efektine karşı koruma.
  const sentKey = useRef<string | null>(null);
  const key = `${eventType}:${hotelSlug ?? ""}:${JSON.stringify(payload ?? {})}`;

  useEffect(() => {
    if (sentKey.current === key) return;
    sentKey.current = key;
    void trackEvent(eventType, payload ?? {}, hotelSlug);
  }, [key, eventType, hotelSlug, payload]);

  return null;
}

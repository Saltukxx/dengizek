"use client";

// ---------------------------------------------------------------------------
// Misafir sayfalarında reklam kodları (Google Ads / GA4).
//
// - Her sayfa açılışında reklam parametreleri (gclid, utm_*) oturuma alınır.
// - Onay varsa sayfanın kodları (sayfa kaydı + sayfanın oteli) yüklenir.
// - Talep başarı sayfasında dönüşüm: giriş sayfasının + talebin otelinin
//   kodlarıyla, talep numarası işlem kimliği olarak (bir kez).
// Onay sonradan verilirse (dengizek:consent) aynı sayfa için yeniden denenir.
// ---------------------------------------------------------------------------

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  configIds,
  conversionTargets,
  hotelSlugFromPath,
  isInquiryPath,
  isInquirySuccessPath,
  tagsForConversion,
  tagsForPage,
  type PublicAdTag,
} from "@/lib/ad-tags";
import { captureAttribution, configureTags, sendConversions, takePendingConversion } from "@/lib/ad-tags-client";
import { hasAnalyticsConsent } from "@/lib/consent";

export function AdTagManager({ tags }: { tags: PublicAdTag[] }) {
  const path = usePathname() ?? "/";
  const [consent, setConsent] = useState(false);
  // Aynı sayfa için ikinci yapılandırma (= ikinci sayfa görüntüleme) olmasın.
  const configuredPath = useRef<string | null>(null);

  useEffect(() => {
    setConsent(hasAnalyticsConsent());
    const onConsent = () => setConsent(hasAnalyticsConsent());
    window.addEventListener("dengizek:consent", onConsent);
    return () => window.removeEventListener("dengizek:consent", onConsent);
  }, []);

  useEffect(() => {
    const search = window.location.search;
    const attribution = captureAttribution(path, search);
    if (!tags.length) return;
    // State ilk render'da henüz false olabilir; karar anlık onaydan okunur,
    // `consent` yalnız onay sonradan verilince efekti yeniden çalıştırır.
    const granted = hasAnalyticsConsent();

    if (isInquirySuccessPath(path)) {
      const pending = takePendingConversion();
      if (!pending || !granted) return;
      const matched = tagsForConversion(tags, attribution.landingPath ?? null, pending.hotelSlug);
      sendConversions(
        configIds(matched),
        conversionTargets(matched),
        [...new Set(matched.map((t) => t.ga4Id).filter((v): v is string => Boolean(v)))],
        pending.inquiryId,
      );
      return;
    }

    if (!granted || configuredPath.current === path) return;
    configuredPath.current = path;
    const hotelSlug = hotelSlugFromPath(path) ?? (isInquiryPath(path) ? new URLSearchParams(search).get("hotel") : null);
    configureTags(configIds(tagsForPage(tags, path, hotelSlug)), path);
  }, [path, tags, consent]);

  return null;
}

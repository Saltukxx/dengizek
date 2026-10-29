"use client";

// ---------------------------------------------------------------------------
// Analitik onay bandı — varsayılan REDDET.
//
// Zorunlu çerezler (oturum, güvenlik) onaydan bağımsız çalışır; bu band
// yalnızca isteğe bağlı kullanım analitiği içindir. Seçim yapılana kadar
// hiçbir istemci analitiği gönderilmez (bkz. analytics-client.trackEvent).
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { readConsent, writeConsent } from "@/lib/consent";

export function ConsentBanner() {
  // Sunucuda ve ilk render'da gizli — localStorage yalnızca istemcide okunur,
  // aksi halde hydration uyuşmazlığı olur.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (readConsent() === null) setVisible(true);
  }, []);

  if (!visible) return null;

  function decide(value: "granted" | "denied") {
    writeConsent(value);
    setVisible(false);
  }

  return (
    <div role="dialog" aria-live="polite" aria-label="Analitik tercihi" className="er-consent">
      <p
        style={{
          margin: 0,
          flex: "1 1 320px",
          color: "var(--er-text-muted)",
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        Deneyimi geliştirmek ve reklamlarımızın etkisini ölçmek için isteğe bağlı kullanım
        istatistikleri ile Google ölçüm çerezlerini kullanmak istiyoruz. Kişiselleştirilmiş
        reklam yapılmaz. Sitenin çalışması için gerekli çerezler bu tercihten etkilenmez.
      </p>
      <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
        <button type="button" onClick={() => decide("denied")} className="er-btn er-btn-ghost">
          Reddet
        </button>
        <button type="button" onClick={() => decide("granted")} className="er-btn er-btn-primary">
          Kabul et
        </button>
      </div>
    </div>
  );
}

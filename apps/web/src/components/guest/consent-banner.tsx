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
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Analitik tercihi"
      style={{
        position: "fixed",
        left: 16,
        right: 16,
        bottom: 16,
        zIndex: 1000,
        maxWidth: 720,
        margin: "0 auto",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 14,
        padding: "16px 18px",
        borderRadius: 10,
        border: "1px solid rgba(212,175,55,0.28)",
        background: "rgba(12,16,22,0.96)",
        backdropFilter: "blur(8px)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
      }}
    >
      <p
        style={{
          margin: 0,
          flex: "1 1 320px",
          color: "var(--lux-muted)",
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        Deneyimi geliştirmek için isteğe bağlı kullanım istatistikleri toplamak istiyoruz.
        Sitenin çalışması için gerekli çerezler bu tercihten etkilenmez.
      </p>
      <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => decide("denied")}
          style={{
            padding: "9px 16px",
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.22)",
            background: "transparent",
            color: "var(--lux-muted)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Reddet
        </button>
        <button
          type="button"
          onClick={() => decide("granted")}
          style={{
            padding: "9px 16px",
            borderRadius: 6,
            border: "1px solid var(--lux-gold)",
            background: "var(--lux-gold)",
            color: "#12161d",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Kabul et
        </button>
      </div>
    </div>
  );
}

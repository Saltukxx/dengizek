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
        borderRadius: "var(--er-radius-md)",
        border: "1px solid var(--er-line)",
        background: "rgba(255,255,255,0.97)",
        backdropFilter: "blur(8px)",
        boxShadow: "var(--er-shadow-lg)",
      }}
    >
      <p
        style={{
          margin: 0,
          flex: "1 1 320px",
          color: "var(--er-text-muted)",
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
            minHeight: 44,
            padding: "9px 16px",
            borderRadius: "var(--er-radius)",
            border: "1px solid #0e1f40",
            background: "#ffffff",
            color: "#0e1f40",
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
            minHeight: 44,
            padding: "9px 16px",
            borderRadius: "var(--er-radius)",
            border: "1px solid #0e1f40",
            background: "#0e1f40",
            color: "#fff",
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

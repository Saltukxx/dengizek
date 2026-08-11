/* eslint-disable @next/next/no-img-element */
// ---------------------------------------------------------------------------
// Misafir ekstra hizmetler bölümü — transfer, spa, romantik paketler...
// ---------------------------------------------------------------------------

import type { Extra } from "@/lib/db/schema";
import { extraCategoryLabels } from "@/lib/schemas/hotel-content";
import { formatPrice } from "@/lib/price";

export function ExtrasSection({ extras }: { extras: Extra[] }) {
  if (extras.length === 0) return null;

  return (
    <section className="er-detail-section">
      <div style={{ marginBottom: 24 }}>
        <h2
          className="er-display er-h2"
        >
          Ekstra Hizmetler
        </h2>
        
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))",
          gap: 22,
        }}
      >
        {extras.map((extra) => (
          <article
            key={extra.id}
            className="er-card"
            style={{
              borderRadius: "var(--er-radius-md)",
              overflow: "hidden",
              border: "1px solid var(--er-line)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {extra.imageUrl && (
              <img
                src={extra.imageUrl}
                alt={extra.name}
                style={{ width: "100%", height: 160, objectFit: "cover" }}
              />
            )}
            <div style={{ padding: "18px 20px 20px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
              <p className="er-eyebrow" style={{ margin: 0, color: "var(--er-primary)", fontSize: 10 }}>
                {extraCategoryLabels[extra.category as keyof typeof extraCategoryLabels] ?? extra.category}
              </p>
              <h3 style={{ margin: 0, color: "var(--er-text)", fontSize: 19, fontWeight: 700 }}>
                {extra.name}
              </h3>
              {extra.description && (
                <p style={{ margin: 0, color: "var(--er-text-muted)", fontSize: 14, lineHeight: 1.6 }}>
                  {extra.description}
                </p>
              )}
              <div
                style={{
                  marginTop: "auto",
                  paddingTop: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <span style={{ color: "var(--er-primary)", fontWeight: 700, fontSize: 16 }}>
                  {formatPrice(extra.priceMinor, extra.currency, extra.priceOnRequest)}
                </span>
                {extra.unitLabel && (
                  <span style={{ color: "var(--er-text-dim)", fontSize: 12 }}>{extra.unitLabel}</span>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

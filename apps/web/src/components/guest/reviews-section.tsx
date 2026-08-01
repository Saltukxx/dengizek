// ---------------------------------------------------------------------------
// Misafir yorumları bölümü — yalnızca yayına alınmış (moderasyondan geçmiş)
// yorumlar. "Doğrulanmış misafir" rozeti yalnızca talep portalından yazılan
// yorumlara verilir (source = "verified_guest").
// ---------------------------------------------------------------------------

import { IconCircleCheck, IconStarFilled } from "@tabler/icons-react";
import type { GuestReviewSummary } from "@/lib/hotels-repo";

function Stars({ rating, size = 15 }: { rating: number; size?: number }) {
  return (
    <span
      style={{ display: "inline-flex", gap: 2 }}
      aria-label={`5 üzerinden ${rating}`}
      role="img"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <IconStarFilled
          key={n}
          size={size}
          color={n <= rating ? "var(--lux-gold)" : "rgba(212,175,55,0.22)"}
        />
      ))}
    </span>
  );
}

function formatStayDate(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m] = iso.split("-").map(Number);
  if (!y || !m) return null;
  return new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, 1)));
}

export function ReviewsSection({ summary }: { summary: GuestReviewSummary }) {
  if (summary.count === 0) return null;

  return (
    <section style={{ maxWidth: 1280, margin: "0 auto", padding: "0 32px 96px" }}>
      <div style={{ marginBottom: 42 }}>
        <h2
          className="luxury-sans-title"
          style={{ margin: 0, fontSize: "clamp(36px, 4.5vw, 56px)", lineHeight: 1.08 }}
        >
          Misafir Yorumları
        </h2>
        <div style={{ width: 50, height: 4, background: "var(--lux-gold)", marginTop: 16 }} />
      </div>

      {/* Puan özeti */}
      <div
        className="luxury-glass"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 32,
          padding: "26px 28px",
          borderRadius: 8,
          border: "1px solid rgba(212,175,55,0.16)",
          marginBottom: 32,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 46,
              lineHeight: 1,
              color: "var(--lux-gold)",
              fontFamily: "var(--lux-font-serif, inherit)",
            }}
          >
            {summary.average?.toLocaleString("tr-TR") ?? "—"}
          </div>
          <div style={{ marginTop: 8 }}>
            <Stars rating={Math.round(summary.average ?? 0)} size={17} />
          </div>
          <p style={{ margin: "8px 0 0", color: "var(--lux-muted)", fontSize: 13 }}>
            {summary.count} yorum
          </p>
        </div>

        <div style={{ flex: "1 1 240px", minWidth: 200, display: "grid", gap: 6 }}>
          {[5, 4, 3, 2, 1].map((star) => {
            const count = summary.distribution[star] ?? 0;
            const pct = summary.count > 0 ? (count / summary.count) * 100 : 0;
            return (
              <div key={star} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: "var(--lux-muted)", fontSize: 12, width: 12 }}>{star}</span>
                <div
                  style={{
                    flex: 1,
                    height: 6,
                    borderRadius: 3,
                    background: "rgba(212,175,55,0.12)",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ width: `${pct}%`, height: "100%", background: "var(--lux-gold)" }} />
                </div>
                <span
                  style={{ color: "var(--lux-muted)", fontSize: 12, width: 24, textAlign: "right" }}
                >
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Yorum listesi */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(340px, 100%), 1fr))",
          gap: 22,
        }}
      >
        {summary.reviews.map((r) => {
          const stay = formatStayDate(r.stayDate);
          return (
            <article
              key={r.id}
              className="luxury-glass"
              style={{
                padding: "22px 24px",
                borderRadius: 8,
                border: "1px solid rgba(212,175,55,0.16)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                }}
              >
                <div>
                  <Stars rating={r.rating} />
                  {r.title && (
                    <p style={{ margin: "10px 0 0", fontSize: 16, lineHeight: 1.35 }}>{r.title}</p>
                  )}
                </div>
                {r.source === "verified_guest" && (
                  <span
                    className="luxury-label"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      color: "var(--lux-gold)",
                      fontSize: 10,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <IconCircleCheck size={13} />
                    Doğrulanmış
                  </span>
                )}
              </div>

              <p
                style={{
                  margin: "12px 0 0",
                  color: "var(--lux-muted)",
                  fontSize: 14,
                  lineHeight: 1.65,
                }}
              >
                {r.body}
              </p>

              <p style={{ margin: "14px 0 0", color: "var(--lux-muted)", fontSize: 12 }}>
                {r.guestName}
                {stay ? ` · ${stay}` : ""}
              </p>

              {r.reply && (
                <div
                  style={{
                    marginTop: 14,
                    paddingTop: 14,
                    borderTop: "1px solid rgba(212,175,55,0.16)",
                  }}
                >
                  <p
                    className="luxury-label"
                    style={{ margin: "0 0 6px", color: "var(--lux-gold)", fontSize: 10 }}
                  >
                    Tesisin yanıtı
                  </p>
                  <p
                    style={{
                      margin: 0,
                      color: "var(--lux-muted)",
                      fontSize: 13,
                      lineHeight: 1.6,
                    }}
                  >
                    {r.reply}
                  </p>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

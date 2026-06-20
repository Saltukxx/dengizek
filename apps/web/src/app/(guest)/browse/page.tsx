import type { Metadata } from "next";
import Link from "next/link";
import { getPublishedHotels } from "@/lib/hotels-repo";
import { HotelCard, EmptyState } from "@/components/marketing";

export const metadata: Metadata = {
  title: "Otelleri keşfet",
  description: "Etkileşimli video turlu otelleri filtreleyin ve bulun.",
};

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  let hotels = await getPublishedHotels();
  if (q) {
    hotels = hotels.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        h.city.toLowerCase().includes(q) ||
        h.country.toLowerCase().includes(q),
    );
  }

  return (
    <div
      style={{
        maxWidth: 1280,
        margin: "0 auto",
        padding: "clamp(32px, 5vw, 72px) clamp(24px, 5vw, 64px)",
      }}
    >
      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: "clamp(32px, 4vw, 52px)" }}>
        <p
          style={{
            margin: "0 0 10px",
            fontFamily: "var(--lux-font-sans)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: "var(--lux-gold)",
          }}
        >
          Destinasyonlar
        </p>
        <h1
          style={{
            margin: "0 0 10px",
            fontFamily: "var(--lux-font-sans)",
            fontSize: "clamp(28px, 4vw, 48px)",
            fontWeight: 700,
            letterSpacing: "-0.025em",
            lineHeight: 1.1,
            color: "var(--lux-text)",
          }}
        >
          Keşfet
        </h1>
        <div style={{ width: 48, height: 2, background: "var(--lux-gold)", opacity: 0.6 }} />
      </div>

      {/* ── Search ───────────────────────────────────────────────────────────── */}
      <form method="GET" action="/browse" style={{ marginBottom: "clamp(32px, 4vw, 48px)" }}>
        <div style={{ position: "relative", maxWidth: 480, display: "flex", gap: 10 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <svg
              aria-hidden
              width="16" height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              style={{
                position: "absolute",
                left: 16,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--lux-dim)",
                pointerEvents: "none",
              }}
            >
              <circle cx="11" cy="11" r="7"/>
              <path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              name="q"
              defaultValue={sp.q}
              placeholder="Şehir veya otel adı"
              className="lux-search-input"
              autoComplete="off"
            />
          </div>
          <button
            type="submit"
            className="luxury-gold-button"
            style={{ borderRadius: 2, minWidth: 80, minHeight: 48, cursor: "pointer" }}
          >
            Ara
          </button>
        </div>
      </form>

      {/* ── Results ──────────────────────────────────────────────────────────── */}
      {hotels.length === 0 ? (
        <EmptyState
          title="Eşleşen otel yok"
          description="Aramayı genişletin veya sorguyu temizleyin."
          action={
            <Link
              href="/browse"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 44,
                padding: "0 1.5rem",
                fontFamily: "var(--lux-font-sans)",
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "0.08em",
                color: "var(--lux-gold)",
                border: "1px solid rgba(212,175,55,0.35)",
                borderRadius: 2,
                textDecoration: "none",
                marginTop: 8,
              }}
            >
              Aramayı temizle
            </Link>
          }
        />
      ) : (
        <>
          {q && (
            <p
              style={{
                marginBottom: 20,
                fontFamily: "var(--lux-font-sans)",
                fontSize: 13,
                color: "var(--lux-dim)",
                letterSpacing: "0.04em",
              }}
            >
              {hotels.length} sonuç &mdash; &ldquo;{sp.q}&rdquo;
              &nbsp;&middot;&nbsp;
              <Link href="/browse" style={{ color: "var(--lux-gold)", textDecoration: "none" }}>
                Temizle
              </Link>
            </p>
          )}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 380px), 1fr))",
              gap: "clamp(12px, 1.5vw, 20px)",
            }}
          >
            {hotels.map((h) => (
              <HotelCard key={h.slug} hotel={h} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

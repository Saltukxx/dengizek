import type { Metadata } from "next";
import Link from "next/link";
import { Hero, HotelCard } from "@/components/marketing";
import { getPublishedHotels } from "@/lib/hotels-repo";

export const metadata: Metadata = {
  title: "Etkileşimli video turlarla otelleri keşfedin",
  description:
    "Seçili otellere göz atın, lobiden odalara adım adım, durdurulabilir video turlarla ilerleyin.",
};

export default async function HomePage() {
  const hotels = (await getPublishedHotels()).slice(0, 4);

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────────────── */}
      <Hero
        eyebrow="Gecenin Zarafeti"
        title="Gitmeden önce — hareketle gördüğünüz bir yerde kalın."
        description="Dengizek, sade listeleri etkileşimli video turlarla birleştirir. Lobide ve odalarda kendi hızınızda ilerleyin."
        primaryCta={{ label: "Otelleri Keşfet", href: "/browse" }}
        secondaryCta={{ label: "Talep Gönder", href: "/inquiry" }}
        bgImage="https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1600&q=80"
      />

      {/* ── Öne çıkanlar ─────────────────────────────────────────────────────────── */}
      <section
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "clamp(48px, 8vw, 96px) clamp(24px, 5vw, 64px)",
        }}
      >
        {/* Section header */}
        <div style={{ marginBottom: "clamp(32px, 4vw, 56px)" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
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
                Seçili Mülkler
              </p>
              <h2
                style={{
                  margin: 0,
                  fontFamily: "var(--lux-font-sans)",
                  fontSize: "clamp(28px, 4vw, 44px)",
                  fontWeight: 700,
                  letterSpacing: "-0.025em",
                  lineHeight: 1.1,
                  color: "var(--lux-text)",
                }}
              >
                Öne Çıkanlar
              </h2>
              <div
                style={{
                  marginTop: 14,
                  width: 48,
                  height: 2,
                  background: "var(--lux-gold)",
                  opacity: 0.7,
                }}
              />
            </div>
            <Link
              href="/browse"
              style={{
                fontFamily: "var(--lux-font-sans)",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--lux-gold)",
                textDecoration: "none",
                paddingBottom: 2,
                borderBottom: "1px solid rgba(212,175,55,0.4)",
                transition: "opacity 200ms",
                flexShrink: 0,
              }}
            >
              Tümünü Gör
            </Link>
          </div>
        </div>

        {/* Hotel grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 420px), 1fr))",
            gap: "clamp(12px, 1.5vw, 20px)",
          }}
        >
          {hotels.map((h) => (
            <HotelCard key={h.slug} hotel={h} />
          ))}
        </div>
      </section>

      {/* ── CTA strip ─────────────────────────────────────────────────────────────── */}
      <section
        style={{
          borderTop: "1px solid var(--lux-line)",
          borderBottom: "1px solid var(--lux-line)",
          padding: "clamp(48px, 7vw, 80px) clamp(24px, 5vw, 64px)",
          textAlign: "center",
          background: "linear-gradient(to bottom, rgba(212,175,55,0.04), transparent)",
        }}
      >
        <p
          style={{
            margin: "0 0 12px",
            fontFamily: "var(--lux-font-sans)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: "var(--lux-gold)",
            opacity: 0.8,
          }}
        >
          Mülkünüzü Listeleyin
        </p>
        <h2
          style={{
            margin: "0 auto 24px",
            maxWidth: 520,
            fontFamily: "var(--lux-font-sans)",
            fontSize: "clamp(24px, 3.5vw, 38px)",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "var(--lux-text)",
          }}
        >
          Otelinizi video turla tanıtın
        </h2>
        <Link
          href="/inquiry"
          className="luxury-gold-button"
          style={{ borderRadius: 2, display: "inline-flex" }}
        >
          Talep Gönder
        </Link>
      </section>
    </>
  );
}

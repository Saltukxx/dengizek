import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Talep alındı",
  robots: { index: false, follow: false },
};

export default function InquirySuccessPage() {
  return (
    <div
      style={{
        maxWidth: 560,
        margin: "0 auto",
        padding: "clamp(64px, 10vw, 120px) clamp(24px, 5vw, 48px)",
        textAlign: "center",
      }}
    >
      {/* Gold check circle */}
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          border: "1px solid rgba(212,175,55,0.5)",
          background: "rgba(212,175,55,0.07)",
          display: "grid",
          placeItems: "center",
          margin: "0 auto 32px",
          color: "var(--lux-gold)",
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4.5 12.75l6 6 9-13.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      <p
        style={{
          margin: "0 0 12px",
          fontFamily: "var(--lux-font-sans)",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.24em",
          textTransform: "uppercase",
          color: "var(--lux-gold)",
        }}
      >
        Mesajınız Alındı
      </p>

      <h1
        style={{
          margin: "0 0 16px",
          fontFamily: "var(--lux-font-sans)",
          fontSize: "clamp(28px, 4vw, 42px)",
          fontWeight: 700,
          letterSpacing: "-0.025em",
          color: "var(--lux-text)",
        }}
      >
        Teşekkürler
      </h1>

      <div style={{ width: 48, height: 2, background: "var(--lux-gold)", opacity: 0.6, margin: "0 auto 24px" }} />

      <p
        style={{
          margin: "0 0 40px",
          fontFamily: "var(--lux-font-sans)",
          fontSize: 15,
          lineHeight: 1.7,
          color: "var(--lux-muted)",
        }}
      >
        Mesajınız alındı (demo). Canlı ortamda otel temsilcisi e-posta veya telefonla dönüş yapardı.
      </p>

      <Link
        href="/browse"
        className="luxury-gold-button"
        style={{ borderRadius: 2, display: "inline-flex" }}
      >
        Keşfet Sayfasına Dön
      </Link>
    </div>
  );
}

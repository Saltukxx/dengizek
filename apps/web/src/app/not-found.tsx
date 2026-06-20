import Link from "next/link";

export default function NotFound() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60dvh",
        gap: 16,
        padding: "40px 24px",
        textAlign: "center",
        fontFamily: "var(--lux-font-sans)",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.24em",
          textTransform: "uppercase",
          color: "var(--lux-gold)",
        }}
      >
        404
      </p>
      <h1
        style={{
          margin: 0,
          fontSize: "clamp(28px, 4vw, 42px)",
          fontWeight: 700,
          letterSpacing: "-0.025em",
          color: "var(--lux-text)",
        }}
      >
        Sayfa bulunamadı
      </h1>
      <p style={{ margin: 0, color: "var(--lux-muted)", fontSize: 15 }}>
        Aradığınız sayfa mevcut değil.
      </p>
      <Link
        href="/"
        className="luxury-gold-button"
        style={{ marginTop: 8, borderRadius: 2, display: "inline-flex" }}
      >
        Ana sayfaya dön
      </Link>
    </div>
  );
}

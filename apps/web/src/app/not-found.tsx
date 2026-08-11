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
        fontFamily: "var(--er-font-sans)",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.24em",
          textTransform: "uppercase",
          color: "var(--er-primary)",
        }}
      >
        404
      </p>
      <h1 className="er-display er-h1">Sayfa bulunamadı</h1>
      <p style={{ margin: 0, color: "var(--er-text-muted)", fontSize: 15 }}>
        Aradığınız sayfa mevcut değil.
      </p>
      <Link href="/" className="er-btn er-btn-primary" style={{ marginTop: 8 }}>
        Ana sayfaya dön
      </Link>
    </div>
  );
}

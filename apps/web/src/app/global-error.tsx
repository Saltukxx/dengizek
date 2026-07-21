"use client";

// Kök layout dahil her şey çöktüğünde gösterilen son savunma hattı.
// Kendi <html>/<body>'sini render etmek zorundadır; framework CSS'i
// yüklenmemiş olabileceğinden stiller inline tutulur.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="tr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0c0c",
          color: "#e8e2d5",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ textAlign: "center", padding: 24, maxWidth: 480 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>
            Beklenmeyen bir hata oluştu
          </h1>
          <p style={{ color: "#9a938a", fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
            Sorun bize iletildi. Lütfen tekrar deneyin; devam ederse birkaç dakika sonra
            yeniden ziyaret edin.
          </p>
          {error.digest && (
            <p style={{ color: "#5c574f", fontSize: 12, marginBottom: 24 }}>
              Hata kodu: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "10px 28px",
              borderRadius: 6,
              border: "1px solid rgba(212,175,55,0.6)",
              background: "transparent",
              color: "#d4af37",
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Tekrar dene
          </button>
        </div>
      </body>
    </html>
  );
}

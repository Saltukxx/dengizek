import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Talep alındı",
  robots: { index: false, follow: false },
};

export async function InquirySuccessPage({
  searchParams,
  surface = "yaz",
}: {
  searchParams: Promise<{ emailStatus?: string }>;
  surface?: "yaz" | "kis";
}) {
  const { emailStatus } = await searchParams;
  const statusMessage =
    emailStatus === "sent"
      ? "Talebiniz otele iletildi ve takip bağlantınız e-posta adresinize gönderildi."
      : emailStatus === "queued"
        ? "Talebiniz otele iletildi. Takip e-postanız gönderim kuyruğuna alındı."
        : "Talebiniz otele iletildi. E-posta bildirimi şu anda gönderilemiyor; takip bağlantınız hazır olduğunda e-postanıza ulaşacak.";
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
          border: "1px solid var(--er-line)",
          background: "var(--er-primary-tint)",
          display: "grid",
          placeItems: "center",
          margin: "0 auto 32px",
          color: "var(--er-primary)",
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4.5 12.75l6 6 9-13.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      <p
        style={{
          margin: "0 0 12px",
          fontFamily: "var(--er-font-sans)",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.24em",
          textTransform: "uppercase",
          color: "var(--er-primary)",
        }}
      >
        Mesajınız Alındı
      </p>

      <h1
        style={{
          margin: "0 0 16px",
          fontFamily: "var(--er-font-sans)",
          fontSize: "clamp(28px, 4vw, 42px)",
          fontWeight: 700,
          letterSpacing: "-0.025em",
          color: "var(--er-text)",
        }}
      >
        Teşekkürler
      </h1>

      <p
        style={{
          margin: "0 0 40px",
          fontFamily: "var(--er-font-sans)",
          fontSize: 15,
          lineHeight: 1.7,
          color: "var(--er-text-muted)",
        }}
      >
        {statusMessage}
      </p>

      <Link
        href={surface === "kis" ? "/kis/oteller" : "/browse"}
        className="er-btn er-btn-cta"
        
      >
        {surface === "kis" ? "Kış Otellerine Dön" : "Keşfet Sayfasına Dön"}
      </Link>
    </div>
  );
}

export default InquirySuccessPage;

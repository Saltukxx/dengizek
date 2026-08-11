import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

type HeroProps = {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  primaryCta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  bgImage?: string;
  /** Hero'nun altına taşan içerik (ör. arama konsolu) için alt boşluk bırakır. */
  overlapChildren?: ReactNode;
};

/**
 * Elite Reserve hero — tam genişlik görsel, koyu gradyan maske ve
 * ortalanmış tipografi. Birincil eylem Action Orange, ikincil eylem cam.
 */
export function Hero({
  eyebrow,
  title,
  description,
  primaryCta,
  secondaryCta,
  bgImage,
  overlapChildren,
}: HeroProps) {
  return (
    <section style={{ position: "relative" }}>
      <div
        style={{
          position: "relative",
          minHeight: overlapChildren ? "clamp(460px, 62vh, 620px)" : "clamp(420px, 56vh, 560px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          paddingBottom: overlapChildren ? "clamp(72px, 9vw, 120px)" : 0,
        }}
      >
        {bgImage && (
          <Image
            src={bgImage}
            alt=""
            fill
            priority
            sizes="100vw"
            style={{ objectFit: "cover", zIndex: 0 }}
          />
        )}

        {/* Okunabilirlik maskesi */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            background:
              "linear-gradient(180deg, rgba(14,31,64,0.55) 0%, rgba(14,31,64,0.38) 45%, rgba(14,31,64,0.62) 100%)",
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 2,
            textAlign: "center",
            maxWidth: 760,
            padding: "clamp(48px, 8vw, 96px) var(--er-gutter)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 20,
          }}
        >
          {eyebrow && (
            <span
              className="er-eyebrow"
              style={{
                color: "#fff",
                background: "rgba(255,255,255,0.16)",
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: 999,
                padding: "6px 16px",
                backdropFilter: "blur(8px)",
              }}
            >
              {eyebrow}
            </span>
          )}

          <h1
            className="er-display"
            style={{
              fontSize: "clamp(32px, 6vw, 60px)",
              color: "#fff",
              textShadow: "0 2px 24px rgba(14,31,64,0.45)",
            }}
          >
            {title}
          </h1>

          {description && (
            <p
              className="er-lede"
              style={{
                color: "rgba(255,255,255,0.92)",
                maxWidth: 560,
                textShadow: "0 1px 12px rgba(14,31,64,0.4)",
              }}
            >
              {description}
            </p>
          )}

          {(primaryCta || secondaryCta) && (
            <div
              style={{
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                justifyContent: "center",
                marginTop: 8,
              }}
            >
              {primaryCta && (
                <Link href={primaryCta.href} className="er-btn er-btn-cta">
                  {primaryCta.label}
                </Link>
              )}
              {secondaryCta && (
                <Link href={secondaryCta.href} className="er-btn er-btn-glass">
                  {secondaryCta.label}
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Hero'nun altına taşan arama konsolu */}
      {overlapChildren && (
        <div
          className="er-container"
          style={{ position: "relative", zIndex: 3, marginTop: "clamp(-88px, -8vw, -56px)" }}
        >
          {overlapChildren}
        </div>
      )}
    </section>
  );
}

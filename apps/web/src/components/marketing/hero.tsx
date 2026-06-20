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
};

export function Hero({ eyebrow, title, description, primaryCta, secondaryCta, bgImage }: HeroProps) {
  return (
    <section
      style={{
        position: "relative",
        minHeight: "92dvh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* Background image — Next.js Image for optimization + priority LCP */}
      {bgImage && (
        <Image
          src={bgImage}
          alt=""
          fill
          priority
          sizes="100vw"
          style={{
            objectFit: "cover",
            opacity: 0.55,
            mixBlendMode: "luminosity",
            zIndex: 0,
          }}
        />
      )}

      {/* Gradient overlay */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          background:
            "linear-gradient(to top, var(--lux-bg) 0%, rgba(11,15,18,0.55) 46%, rgba(11,15,18,0.18) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Radial gold glow */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          background:
            "radial-gradient(ellipse 70% 45% at 50% 0%, rgba(212,175,55,0.10) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Content */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          textAlign: "center",
          maxWidth: 760,
          padding: "0 clamp(24px, 5vw, 64px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "clamp(20px, 3vw, 32px)",
        }}
      >
        {eyebrow && (
          <span
            style={{
              display: "inline-block",
              fontFamily: "var(--lux-font-sans)",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              color: "var(--lux-gold)",
              opacity: 0.9,
              border: "1px solid rgba(212,175,55,0.32)",
              borderRadius: 999,
              padding: "5px 16px",
              backdropFilter: "blur(8px)",
            }}
          >
            {eyebrow}
          </span>
        )}

        <h1
          style={{
            margin: 0,
            fontFamily: "var(--lux-font-sans)",
            fontSize: "clamp(36px, 7vw, 72px)",
            fontWeight: 700,
            letterSpacing: "-0.025em",
            lineHeight: 1.08,
            color: "var(--lux-text)",
          }}
        >
          {title}
        </h1>

        {description && (
          <p
            style={{
              margin: 0,
              fontFamily: "var(--lux-font-sans)",
              fontSize: "clamp(16px, 2vw, 19px)",
              lineHeight: 1.6,
              color: "var(--lux-muted)",
              maxWidth: 580,
            }}
          >
            {description}
          </p>
        )}

        {(primaryCta || secondaryCta) && (
          <div
            style={{
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
              justifyContent: "center",
              marginTop: 8,
            }}
          >
            {primaryCta && (
              <Link href={primaryCta.href} className="luxury-gold-button" style={{ borderRadius: 2 }}>
                {primaryCta.label}
              </Link>
            )}
            {secondaryCta && (
              <Link
                href={secondaryCta.href}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 48,
                  padding: "0 2rem",
                  fontFamily: "var(--lux-font-sans)",
                  fontSize: 14,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  color: "var(--lux-muted)",
                  border: "1px solid rgba(208,197,178,0.25)",
                  borderRadius: 2,
                  textDecoration: "none",
                  transition: "color 220ms, border-color 220ms",
                }}
              >
                {secondaryCta.label}
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

type HeroProps = {
  title: string;
  description?: ReactNode;
  bgImage?: string;
  /** Görseldeki tesis — sağ altta küçük bir künye olarak bağlanır. */
  imageCredit?: { label: string; href: string };
  /** Başlığın altındaki içerik (ör. arama formu). */
  children?: ReactNode;
};

/**
 * Ana sayfa hero'su — tam genişlik tesis görseli, soldan koyulaşan maske,
 * sola hizalı başlık ve doğrudan hero içinde arama.
 */
export function Hero({ title, description, bgImage, imageCredit, children }: HeroProps) {
  return (
    <section className="er-hero">
      {bgImage && (
        <Image src={bgImage} alt="" fill priority sizes="100vw" style={{ objectFit: "cover" }} />
      )}
      <div className="er-hero-mask" aria-hidden />

      <div className="er-container er-hero-inner">
        <h1 className="er-display er-hero-title">{title}</h1>
        {description && <p className="er-hero-lede">{description}</p>}
        {children}
      </div>

      {imageCredit && (
        <Link href={imageCredit.href} className="er-hero-credit">
          Görseldeki tesis: {imageCredit.label}
        </Link>
      )}
    </section>
  );
}

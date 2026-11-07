import type { ReactNode } from "react";

export interface PageBannerProps {
  /** Başlığın üstünde küçük vurgu etiketi ("Termal seçkisi"). */
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  /** Başlıktan önce: sayfa yolu (breadcrumb). */
  before?: ReactNode;
  /** Başlıktan sonra: arama kutusu, özet satırı… */
  children?: ReactNode;
  /** Altındaki içerik banner'ın üstüne biner (form/kart sayfaları). */
  overlap?: boolean;
  className?: string;
}

/**
 * Misafir sayfalarının ortak banner'ı — vitrin ana sayfasındaki koyu degrade
 * dilinin sade hâli. Renkler kabuğun --tm-* tokenlarından gelir (yaz, kış,
 * termal); sayfa yüzeyi bilmek zorunda değildir.
 */
export function PageBanner({ eyebrow, title, lede, before, children, overlap, className }: PageBannerProps) {
  return (
    <section className={`pb${overlap ? " pb-overlap" : ""}${className ? ` ${className}` : ""}`}>
      <div className="pb-glow" aria-hidden />
      <div className="er-container pb-inner">
        {before ? <div className="pb-before">{before}</div> : null}
        {eyebrow ? <p className="pb-eyebrow">{eyebrow}</p> : null}
        <h1 className="er-display pb-title">{title}</h1>
        {lede ? <p className="pb-lede">{lede}</p> : null}
        {children ? <div className="pb-body">{children}</div> : null}
      </div>
    </section>
  );
}

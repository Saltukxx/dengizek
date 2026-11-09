import Link from "next/link";
import { IconArrowLeft, IconMessageCircle } from "@tabler/icons-react";
import { guestPaths, type GuestSurface } from "@/lib/guest-surface";

type TourHeaderProps = {
  hotelName: string;
  hotelSlug: string;
  backHref: string;
  surface?: GuestSurface;
  /** Talep bağlantısına tıklanınca (tur çıkış kaydı için). */
  onInquiryClick?: () => void;
};

/**
 * Tur ekranının üst çubuğu — site başlığıyla aynı Elite Reserve dilinde:
 * solda marka + tesise dönüş, sağda talep eylemi.
 */
export function TourHeader({ hotelName, hotelSlug, backHref, surface = "yaz", onInquiryClick }: TourHeaderProps) {
  const paths = guestPaths(surface);
  return (
    <header
      className="er-header"
      style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50 }}
    >
      <Link href={paths.home} className="er-brand">
        Otelsayfam
      </Link>

      <nav className="er-nav" aria-label="Tur navigasyonu">
        <Link href={paths.browse} className="er-nav-link">
          Oteller
        </Link>
        <Link href={backHref} className="er-nav-link" data-active="true">
          {hotelName}
        </Link>
      </nav>

      <div className="er-header-actions">
        <Link
          href={backHref}
          className="er-nav-link"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <IconArrowLeft size={16} />
          Turdan çık
        </Link>
        <Link
          href={`${paths.inquiry}?hotel=${hotelSlug}`}
          className="er-btn er-btn-cta"
          onClick={onInquiryClick}
        >
          <IconMessageCircle size={17} />
          Talep Gönder
        </Link>
      </div>
    </header>
  );
}

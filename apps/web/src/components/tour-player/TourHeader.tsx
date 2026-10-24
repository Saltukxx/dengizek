import Link from "next/link";
import { IconArrowLeft, IconMessageCircle } from "@tabler/icons-react";

type TourHeaderProps = {
  hotelName: string;
  hotelSlug: string;
  backHref: string;
  surface?: "yaz" | "kis";
};

/**
 * Tur ekranının üst çubuğu — site başlığıyla aynı Elite Reserve dilinde:
 * solda marka + tesise dönüş, sağda talep eylemi.
 */
export function TourHeader({ hotelName, hotelSlug, backHref, surface = "yaz" }: TourHeaderProps) {
  const isWinter = surface === "kis";
  return (
    <header
      className="er-header"
      style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50 }}
    >
      <Link href={isWinter ? "/kis" : "/"} className="er-brand">
        Otelsayfam
      </Link>

      <nav className="er-nav" aria-label="Tur navigasyonu">
        <Link href={isWinter ? "/kis/oteller" : "/browse"} className="er-nav-link">
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
        <Link href={`${isWinter ? "/kis/talep" : "/inquiry"}?hotel=${hotelSlug}`} className="er-btn er-btn-cta">
          <IconMessageCircle size={17} />
          Talep Gönder
        </Link>
      </div>
    </header>
  );
}

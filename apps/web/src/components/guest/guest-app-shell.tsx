"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useCallback, type ReactNode } from "react";
import {
  IconBuildingSkyscraper,
  IconHome,
  IconLayoutDashboard,
  IconMail,
  IconMenu2,
  IconUserCircle,
  IconX,
} from "@tabler/icons-react";
import { ConsentBanner } from "./consent-banner";

const NAV = [
  { href: "/", label: "Anasayfa" },
  { href: "/browse", label: "Oteller" },
  { href: "/inquiry", label: "İletişim" },
  { href: "/dashboard", label: "Otel Paneli" },
] as const;

const MOBILE_NAV = [
  { href: "/", label: "Anasayfa", Icon: IconHome },
  { href: "/browse", label: "Oteller", Icon: IconBuildingSkyscraper },
  { href: "/inquiry", label: "İletişim", Icon: IconMail },
  { href: "/dashboard", label: "Panel", Icon: IconLayoutDashboard },
] as const;

const FOOTER_LINKS = {
  kesfet: [
    { href: "/browse", label: "Otelleri Keşfet" },
    { href: "/inquiry", label: "Talep Gönder" },
  ],
  kurumsal: [
    { href: "/dashboard", label: "Otel Paneli" },
    { href: "/giris", label: "Giriş Yap" },
  ],
} as const;

/** Sunucuda çözülen oturumun kabukta gösterilen kısmı. */
export type GuestAccount = { name: string; role: "admin" | "manager" };

function navActive(path: string | null, href: string) {
  if (href === "/") return path === "/";
  return path?.startsWith(href) ?? false;
}

export function GuestAppShell({
  children,
  account = null,
}: {
  children: ReactNode;
  account?: GuestAccount | null;
}) {
  const path = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Giriş yapmış kullanıcıya paneli, misafire giriş bağlantısını göster.
  const accountHref = account?.role === "admin" ? "/admin" : "/dashboard";

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Tur oynatıcı kendi tam ekran düzenini yönetir; kabuk devre dışı kalır.
  const isFullBleed = path?.startsWith("/tours/");

  if (isFullBleed)
    return (
      <>
        {children}
        <ConsentBanner />
      </>
    );

  return (
    <>
      <header className="er-header">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Menüyü aç"
          className="er-hamburger"
        >
          <IconMenu2 size={22} />
        </button>

        <Link href="/" className="er-brand">
          Dengizek
        </Link>

        <nav className="er-nav" aria-label="Ana navigasyon">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="er-nav-link"
              data-active={navActive(path, n.href)}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="er-header-actions">
          {account ? (
            <Link
              href={accountHref}
              className="er-nav-link"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              title={account.role === "admin" ? "Yönetim paneli" : "Otel paneli"}
            >
              <IconUserCircle size={18} />
              {account.name}
            </Link>
          ) : (
            <Link href="/giris" className="er-nav-link">
              Giriş Yap
            </Link>
          )}
          <Link href="/inquiry" className="er-btn er-btn-primary">
            Talep Gönder
          </Link>
        </div>
      </header>

      {drawerOpen && (
        <>
          <div className="er-drawer-overlay" onClick={closeDrawer} />
          <nav className="er-drawer" aria-label="Mobil menü">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 20px 16px 24px",
                borderBottom: "1px solid var(--er-line)",
                marginBottom: 8,
              }}
            >
              <span className="er-brand">Dengizek</span>
              <button
                type="button"
                onClick={closeDrawer}
                aria-label="Menüyü kapat"
                className="er-hamburger"
                style={{ display: "flex", margin: 0 }}
              >
                <IconX size={20} />
              </button>
            </div>
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={closeDrawer}
                data-active={navActive(path, n.href)}
              >
                {n.label}
              </Link>
            ))}
            <div style={{ padding: "16px 24px 0" }}>
              <Link
                href={account ? accountHref : "/giris"}
                onClick={closeDrawer}
                className="er-btn er-btn-ghost er-btn-block"
              >
                <IconUserCircle size={18} />
                {account ? account.name : "Giriş Yap"}
              </Link>
            </div>
          </nav>
        </>
      )}

      <main className="er-page">{children}</main>

      <footer className="er-footer">
        <div className="er-container">
          <div className="er-footer-grid">
            <div>
              <span className="er-brand">Dengizek</span>
              <p
                className="er-muted"
                style={{ margin: "12px 0 0", maxWidth: 320, fontSize: 14 }}
              >
                Otelleri gitmeden önce gezin: lobiden odalara, adım adım
                ilerleyen etkileşimli video turları.
              </p>
            </div>

            <div>
              <p className="er-footer-col-title">Keşfet</p>
              {FOOTER_LINKS.kesfet.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
            </div>

            <div>
              <p className="er-footer-col-title">Kurumsal</p>
              {FOOTER_LINKS.kurumsal.map((l) => (
                <Link key={l.href} href={l.href}>
                  {/* Oturum açıkken "Giriş Yap" yerine hesap bağlantısı */}
                  {l.href === "/giris" && account ? "Hesabım" : l.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="er-footer-bottom">
            © {new Date().getFullYear()} Dengizek. Tüm hakları saklıdır.
          </div>
        </div>
      </footer>

      <nav className="er-mobile-nav" aria-label="Mobil navigasyon">
        {MOBILE_NAV.map(({ href, label, Icon }) => (
          <Link key={href} href={href} data-active={navActive(path, href)}>
            <Icon size={22} stroke={1.7} />
            {label}
          </Link>
        ))}
      </nav>

      <ConsentBanner />
    </>
  );
}

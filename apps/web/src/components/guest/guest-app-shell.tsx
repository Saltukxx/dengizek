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
  IconSnowflake,
  IconSun,
  IconUserCircle,
  IconX,
} from "@tabler/icons-react";
import { ConsentBanner } from "./consent-banner";

/**
 * Yaz ve kış yüzeyleri aynı kabuğu paylaşır; yalnızca rotalar, etiketler ve
 * tema sınıfı değişir. Tasarım sistemi tek yerde kalır (globals.css
 * .er-winter token override'ları).
 */
const SURFACES = {
  yaz: {
    themeClass: "",
    home: "/",
    browse: "/browse",
    browseLabel: "Oteller",
    otherHref: "/kis",
    otherLabel: "Kış Otelleri",
    otherIcon: IconSnowflake,
  },
  kis: {
    themeClass: "er-winter",
    home: "/kis",
    browse: "/kis/oteller",
    browseLabel: "Kayak Otelleri",
    otherHref: "/",
    otherLabel: "Yaz Otelleri",
    otherIcon: IconSun,
  },
} as const;

export type GuestSurface = keyof typeof SURFACES;

/** Ana sayfa rotaları — nav aktifliği bunlarda tam eşleşme ister. */
const HOME_HREFS = [SURFACES.yaz.home, SURFACES.kis.home];

/** Sunucuda çözülen oturumun kabukta gösterilen kısmı. */
export type GuestAccount = { name: string; role: "admin" | "manager" };

/**
 * Ana sayfa bağlantıları TAM eşleşme ister: "/kis" ile "/kis/oteller" aynı
 * anda aktif görünmesin.
 */
function navActive(path: string | null, href: string, homeHrefs: string[]) {
  if (homeHrefs.includes(href)) return path === href;
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

  // Hangi yüzeydeyiz? Rotadan türetilir — layout'tan prop geçirmeye gerek yok.
  const surfaceKey: GuestSurface = path?.startsWith("/kis") ? "kis" : "yaz";
  const surface = SURFACES[surfaceKey];

  const NAV =
    surfaceKey === "kis"
      ? [
          { href: surface.home, label: "Kış Otelleri" },
          { href: surface.browse, label: "Oteller" },
          { href: "/inquiry", label: "Nasıl Çalışır?" },
          { href: "/dashboard", label: "Otelini Ekle" },
        ]
      : [
          { href: surface.home, label: "Anasayfa" },
          { href: surface.browse, label: surface.browseLabel },
          { href: "/inquiry", label: "İletişim" },
          { href: "/dashboard", label: "Otel Paneli" },
        ];

  const MOBILE_NAV = [
    { href: surface.home, label: "Anasayfa", Icon: IconHome },
    { href: surface.browse, label: "Oteller", Icon: IconBuildingSkyscraper },
    { href: "/inquiry", label: "İletişim", Icon: IconMail },
    { href: "/dashboard", label: "Panel", Icon: IconLayoutDashboard },
  ];

  const FOOTER_LINKS = {
    kesfet: [
      { href: surface.browse, label: "Otelleri Keşfet" },
      { href: surface.otherHref, label: surface.otherLabel },
      { href: "/inquiry", label: "Talep Gönder" },
    ],
    kurumsal: [
      { href: "/dashboard", label: "Otel Paneli" },
      { href: "/giris", label: "Giriş Yap" },
    ],
  };

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

  const SeasonSwitchIcon = surface.otherIcon;

  return (
    <div className={surface.themeClass}>
      <header className="er-header">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Menüyü aç"
          className="er-hamburger"
        >
          <IconMenu2 size={22} />
        </button>

        <Link href={surface.home} className="er-brand">
          Dengizek
        </Link>

        <nav className="er-nav" aria-label="Ana navigasyon">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="er-nav-link"
              data-active={navActive(path, n.href, HOME_HREFS)}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="er-header-actions">
          {/* Sezonlar arası geçiş — iki yüzey birbirine buradan bağlanır */}
          <Link
            href={surface.otherHref}
            className="er-pill"
            style={{ minHeight: 36, padding: "0 14px", fontSize: 13 }}
          >
            <SeasonSwitchIcon size={16} stroke={1.8} />
            {surface.otherLabel}
          </Link>
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
          <Link href="/inquiry" className={surfaceKey === "kis" ? "er-btn er-btn-cta" : "er-btn er-btn-primary"}>
            {surfaceKey === "kis" ? "Kış Planı Oluştur" : "Talep Gönder"}
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
                data-active={navActive(path, n.href, HOME_HREFS)}
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
          <Link key={href} href={href} data-active={navActive(path, href, HOME_HREFS)}>
            <Icon size={22} stroke={1.7} />
            {label}
          </Link>
        ))}
      </nav>

      <ConsentBanner />
    </div>
  );
}

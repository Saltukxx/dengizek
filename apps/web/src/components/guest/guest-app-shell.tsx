"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  IconMenu2,
  IconUserCircle,
  IconX,
} from "@tabler/icons-react";
import { guestPaths, guestSurfaceFromPath } from "@/lib/guest-surface";
import { ConsentBanner } from "./consent-banner";

/**
 * Yaz, kış ve termal yüzeyleri aynı kabuğu paylaşır; yalnızca rotalar,
 * etiketler ve tema sınıfı değişir. Tasarım sistemi tek yerde kalır
 * (globals.css .er-winter / .er-thermal token override'ları).
 */
const SURFACES = {
  yaz: {
    themeClass: "",
    home: "/",
    browse: "/browse",
    browseLabel: "Oteller",
    switchLabel: "Yaz Otelleri",
    ctaLabel: "Talep Gönder",
  },
  kis: {
    themeClass: "er-winter",
    home: "/kis",
    browse: "/kis/oteller",
    browseLabel: "Kayak Otelleri",
    switchLabel: "Kış Otelleri",
    ctaLabel: "Kış Planı Oluştur",
  },
  termal: {
    themeClass: "er-thermal",
    home: "/termal",
    browse: "/termal/oteller",
    browseLabel: "Termal Oteller",
    switchLabel: "Termal Oteller",
    ctaLabel: "Termal Talep Gönder",
  },
} as const;

export type GuestSurface = keyof typeof SURFACES;

const SURFACE_ORDER: GuestSurface[] = ["yaz", "kis", "termal"];

/** Sezon seçicideki kısa adlar (erişilebilir ad: switchLabel). */
const SEASON_SHORT: Record<GuestSurface, string> = { yaz: "Yaz", kis: "Kış", termal: "Termal" };

/** Ana sayfa rotaları — nav aktifliği bunlarda tam eşleşme ister. */
const HOME_HREFS: string[] = SURFACE_ORDER.map((k) => SURFACES[k].home);

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
  const surfaceKey: GuestSurface = guestSurfaceFromPath(path);
  const surface = SURFACES[surfaceKey];
  const paths = guestPaths(surfaceKey);

  // Misafir menüsü — panel bağlantıları yalnız giriş yapmış hesaba görünür.
  const NAV = [
    { href: surface.home, label: "Anasayfa" },
    { href: surface.browse, label: "Oteller" },
    { href: paths.finder, label: "Otel Bul" },
    { href: `${surface.home}#nasil-calisir`, label: "Nasıl Çalışır?" },
    { href: paths.inquiry, label: "İletişim" },
  ];

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Diğer sezon vitrinleri — başlıkta ve altbilgide geçiş bağlantıları.
  const otherSurfaces = SURFACE_ORDER.filter((k) => k !== surfaceKey).map((k) => SURFACES[k]);

  const FOOTER_LINKS = {
    kesfet: [
      { href: surface.browse, label: "Otelleri Keşfet" },
      ...otherSurfaces.map((o) => ({ href: o.home, label: o.switchLabel })),
      { href: paths.inquiry, label: "Talep Gönder" },
    ],
    kurumsal: [
      { href: "/dashboard", label: "Otelinizi ekleyin" },
      { href: "/giris", label: "Giriş Yap" },
    ],
  };

  // Giriş yapmış kullanıcıya paneli, misafire giriş bağlantısını göster.
  const accountHref = account?.role === "admin" ? "/admin" : "/dashboard";

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Menü açıkken sayfa kaymaz; Escape kapatır; sayfa değişince kapanır.
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

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
    <div className={surface.themeClass}>
      <header className="er-header gh" data-scrolled={scrolled || undefined}>
        <div className="gh-inner">
          <Link href={surface.home} className="gh-brand">
            Otelsayfam
          </Link>

          <nav className="gh-nav" aria-label="Ana navigasyon">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="gh-link" data-active={navActive(path, n.href, HOME_HREFS)}>
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="gh-actions">
            {/* Sezon seçici — vitrinler birbirine buradan bağlanır */}
            <div className="gh-seasons" role="group" aria-label="Vitrin">
              {SURFACE_ORDER.map((key) => {
                const item = SURFACES[key];
                const active = key === surfaceKey;
                return (
                  <Link
                    key={key}
                    href={item.home}
                    className="gh-season"
                    data-active={active || undefined}
                    aria-current={active ? "page" : undefined}
                    aria-label={item.switchLabel}
                  >
                    {SEASON_SHORT[key]}
                  </Link>
                );
              })}
            </div>
            {account ? (
              <Link
                href={accountHref}
                className="gh-account"
                title={account.role === "admin" ? "Yönetim paneli" : "Otel paneli"}
              >
                <IconUserCircle size={18} aria-hidden />
                {account.name}
              </Link>
            ) : null}
            <Link href={paths.inquiry} className="gh-cta">
              {surface.ctaLabel}
            </Link>
            <button type="button" onClick={() => setDrawerOpen(true)} aria-label="Menüyü aç" className="gh-burger">
              <IconMenu2 size={22} />
            </button>
          </div>
        </div>
      </header>

      {drawerOpen && (
        <>
          <div className="er-drawer-overlay" onClick={closeDrawer} />
          <nav className="er-drawer gd" aria-label="Mobil menü">
            <div className="gd-head">
              <Link href={surface.home} onClick={closeDrawer} className="gh-brand">
                Otelsayfam
              </Link>
              <button type="button" onClick={closeDrawer} aria-label="Menüyü kapat" className="gh-burger gd-close">
                <IconX size={22} />
              </button>
            </div>

            <div className="gd-seasons" role="group" aria-label="Vitrin">
              {SURFACE_ORDER.map((key) => (
                <Link
                  key={key}
                  href={SURFACES[key].home}
                  onClick={closeDrawer}
                  className="gd-season"
                  data-active={key === surfaceKey || undefined}
                  aria-current={key === surfaceKey ? "page" : undefined}
                >
                  {SEASON_SHORT[key]}
                </Link>
              ))}
            </div>

            <div className="gd-links">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={closeDrawer}
                  className="gd-link"
                  data-active={navActive(path, n.href, HOME_HREFS)}
                >
                  {n.label}
                </Link>
              ))}
            </div>

            <div className="gd-foot">
              <Link href={paths.inquiry} onClick={closeDrawer} className="gd-cta">
                {surface.ctaLabel}
              </Link>
              {account ? (
                <Link href={accountHref} onClick={closeDrawer} className="gd-owner">
                  <IconUserCircle size={18} aria-hidden />
                  {account.name}
                </Link>
              ) : (
                <Link href="/giris" onClick={closeDrawer} className="gd-owner">
                  Otel sahibi misiniz? Giriş yapın
                </Link>
              )}
            </div>
          </nav>
        </>
      )}

      <main className="er-page">{children}</main>

      <footer className="er-footer">
        <div className="er-container">
          <div className="er-footer-grid">
            <div>
              <span className="er-brand">Otelsayfam</span>
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
            © {new Date().getFullYear()} Otelsayfam. Tüm hakları saklıdır.
          </div>
        </div>
      </footer>

      <ConsentBanner />
    </div>
  );
}

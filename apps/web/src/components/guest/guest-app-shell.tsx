"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useCallback, type ReactNode } from "react";

const NAV = [
  { href: "/",         label: "Anasayfa"    },
  { href: "/browse",   label: "Keşfet"      },
  { href: "/inquiry",  label: "İletişim"    },
  { href: "/dashboard",label: "Otel Paneli" },
] as const;

const MOBILE_NAV = [
  { href: "/",          label: "Anasayfa",  icon: "home"           },
  { href: "/browse",    label: "Keşfet",    icon: "travel_explore"  },
  { href: "/inquiry",   label: "İletişim", icon: "mail"            },
  { href: "/dashboard", label: "Panel",     icon: "dashboard"      },
] as const;

function navActive(path: string | null, href: string) {
  if (href === "/") return path === "/";
  return path?.startsWith(href) ?? false;
}

export function GuestAppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Tour pages and hotel detail pages handle their own full-bleed layout
  const isFullBleed =
    path?.startsWith("/tours/") ||
    path?.startsWith("/hotels/");

  if (isFullBleed) return <>{children}</>;

  return (
    <div style={{ background: "var(--lux-bg)", color: "var(--lux-text)", minHeight: "100dvh" }}>

      {/* ── Fixed luxury header ──────────────────────────────────────────────────── */}
      <header className="luxury-header">
        {/* Mobile: hamburger — shown via CSS .luxury-hamburger */}
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Menü aç"
          className="luxury-hamburger"
        >
          <svg width="22" height="16" viewBox="0 0 22 16" fill="none">
            <rect y="0"  width="22" height="2" rx="1" fill="currentColor" />
            <rect y="7"  width="16" height="2" rx="1" fill="currentColor" />
            <rect y="14" width="22" height="2" rx="1" fill="currentColor" />
          </svg>
        </button>

        {/* Brand */}
        <Link href="/" className="luxury-brand">
          Dengizek
        </Link>

        {/* Desktop nav */}
        <nav className="luxury-home-nav" style={{ display: "flex", gap: 32, alignItems: "center" }}>
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={"luxury-nav-link" + (navActive(path, n.href) ? " active" : "")}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        {/* Right: user icon */}
        <div style={{ width: 32, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: "1px solid rgba(212,175,55,0.35)",
              background: "rgba(0,0,0,0.35)",
              display: "grid",
              placeItems: "center",
              color: "var(--lux-gold)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="8" r="4"/>
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
          </div>
        </div>
      </header>

      {/* ── Mobile drawer overlay ──────────────────────────────────────────────── */}
      {drawerOpen && (
        <>
          <div className="luxury-drawer-overlay" onClick={closeDrawer} />
          <nav className="luxury-drawer">
            <div
              style={{
                padding: "8px 24px 24px",
                borderBottom: "1px solid rgba(212,175,55,0.15)",
                marginBottom: 8,
              }}
            >
              <span className="luxury-brand" style={{ fontSize: 16 }}>Dengizek</span>
            </div>
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={closeDrawer}
                style={{
                  display: "block",
                  padding: "14px 24px",
                  fontFamily: "var(--lux-font-sans)",
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: navActive(path, n.href) ? "var(--lux-gold)" : "rgba(208,197,178,0.72)",
                  textDecoration: "none",
                  borderLeft: navActive(path, n.href) ? "2px solid var(--lux-gold)" : "2px solid transparent",
                  transition: "color 200ms",
                }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </>
      )}

      {/* ── Page content ──────────────────────────────────────────────────────────────── */}
      <main className="luxury-page-content">
        {children}
      </main>

      {/* ── Mobile bottom nav ───────────────────────────────────────────────────── */}
      <nav className="luxury-mobile-bottom-nav" aria-label="Mobil navigasyon">
        {MOBILE_NAV.map((n) => {
          const active = navActive(path, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                color: active ? "var(--lux-gold)" : "rgba(138,155,176,0.7)",
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                textDecoration: "none",
                transition: "color 200ms",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
                {n.icon}
              </span>
              {n.label}
            </Link>
          );
        })}
      </nav>

    </div>
  );
}

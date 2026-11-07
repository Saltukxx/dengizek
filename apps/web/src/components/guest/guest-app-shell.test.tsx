import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/browse";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

// Onay bandı localStorage'a bakar; kabuk testinde ilgisiz.
vi.mock("./consent-banner", () => ({ ConsentBanner: () => null }));

import { GuestAppShell } from "./guest-app-shell";

beforeEach(() => {
  pathname = "/browse";
});

describe("GuestAppShell — oturum durumu", () => {
  it("oturum yoksa giriş bağlantısı gösterir", () => {
    render(
      <GuestAppShell>
        <p>içerik</p>
      </GuestAppShell>,
    );
    expect(screen.getAllByText("Giriş Yap").length).toBeGreaterThan(0);
  });

  it("otel yöneticisi için hesap adı ve otel paneli bağlantısı gösterir", () => {
    render(
      <GuestAppShell account={{ name: "Deniz Yılmaz", role: "manager" }}>
        <p>içerik</p>
      </GuestAppShell>,
    );
    const account = screen.getAllByText("Deniz Yılmaz")[0].closest("a");
    expect(account).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByText("Giriş Yap")).toBeNull();
  });

  it("admin hesabını yönetim paneline yönlendirir", () => {
    render(
      <GuestAppShell account={{ name: "Admin", role: "admin" }}>
        <p>içerik</p>
      </GuestAppShell>,
    );
    expect(screen.getAllByText("Admin")[0].closest("a")).toHaveAttribute("href", "/admin");
  });
});

describe("GuestAppShell — kış yüzeyi", () => {
  it("kış rotalarında Alpine Nocturne kabuğunu ve kış navigasyonunu kullanır", () => {
    pathname = "/kis/oteller";
    const { container } = render(
      <GuestAppShell>
        <p>kış içeriği</p>
      </GuestAppShell>,
    );

    expect(container.firstElementChild).toHaveClass("er-winter");
    expect(screen.getAllByRole("link", { name: "Kış Otelleri" })[0]).toHaveAttribute(
      "href",
      "/kis",
    );
    // "Nasıl Çalışır?" talep formuna değil, kış sayfasındaki anlatıma gider.
    expect(screen.getAllByRole("link", { name: "Nasıl Çalışır?" })[0]).toHaveAttribute(
      "href",
      "/kis#nasil-calisir",
    );
    expect(screen.getByRole("link", { name: "Kış Planı Oluştur" })).toHaveAttribute(
      "href",
      "/kis/talep",
    );
    expect(screen.getAllByRole("link", { name: "Yaz Otelleri" })[0]).toHaveAttribute(
      "href",
      "/",
    );
  });
});

describe("GuestAppShell — termal yüzeyi", () => {
  it("termal rotalarında termal temasını, navigasyonunu ve sezon geçişlerini kullanır", () => {
    pathname = "/termal/oteller";
    const { container } = render(
      <GuestAppShell>
        <p>termal içeriği</p>
      </GuestAppShell>,
    );

    expect(container.firstElementChild).toHaveClass("er-thermal");
    expect(screen.getAllByRole("link", { name: "Nasıl Çalışır?" })[0]).toHaveAttribute(
      "href",
      "/termal#nasil-calisir",
    );
    expect(screen.getByRole("link", { name: "Termal Talep Gönder" })).toHaveAttribute(
      "href",
      "/termal/talep",
    );
    expect(screen.getAllByRole("link", { name: "Yaz Otelleri" })[0]).toHaveAttribute("href", "/");
    expect(screen.getAllByRole("link", { name: "Kış Otelleri" })[0]).toHaveAttribute("href", "/kis");
  });

  it("yaz yüzeyinden kış ve termal vitrinlerine geçiş verir", () => {
    pathname = "/";
    render(
      <GuestAppShell>
        <p>yaz içeriği</p>
      </GuestAppShell>,
    );
    expect(screen.getAllByRole("link", { name: "Kış Otelleri" })[0]).toHaveAttribute("href", "/kis");
    expect(screen.getAllByRole("link", { name: "Termal Oteller" })[0]).toHaveAttribute("href", "/termal");
  });
});

describe("GuestAppShell — panel bağlantıları yalnız hesaba", () => {
  it("misafir menüde panel bağlantısı görmez; mobil alt bar yoktur", () => {
    pathname = "/termal";
    render(
      <GuestAppShell>
        <p>içerik</p>
      </GuestAppShell>,
    );
    const header = screen.getByRole("navigation", { name: "Ana navigasyon" });
    for (const link of header.querySelectorAll("a")) {
      expect(link.getAttribute("href")).not.toMatch(/^\/(dashboard|admin)/);
    }
    expect(screen.queryByRole("navigation", { name: "Mobil navigasyon" })).not.toBeInTheDocument();
  });

  it("sezon seçici üç vitrini gösterir, etkin olanı işaretler", () => {
    pathname = "/kis/oteller";
    render(
      <GuestAppShell>
        <p>içerik</p>
      </GuestAppShell>,
    );
    const group = screen.getByRole("group", { name: "Vitrin" });
    const links = [...group.querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/", "/kis", "/termal"]);
    expect(links[1]).toHaveAttribute("aria-current", "page");
  });
});

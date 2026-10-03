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

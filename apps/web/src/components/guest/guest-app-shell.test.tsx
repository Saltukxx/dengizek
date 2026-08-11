import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/browse",
}));

// Onay bandı localStorage'a bakar; kabuk testinde ilgisiz.
vi.mock("./consent-banner", () => ({ ConsentBanner: () => null }));

import { GuestAppShell } from "./guest-app-shell";

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

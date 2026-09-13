import { act, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PanelNetworkGuard } from "./panel-network-guard";

const originalFetch = window.fetch;

function renderGuard() {
  render(
    <MantineProvider>
      <PanelNetworkGuard />
    </MantineProvider>,
  );
}

afterEach(() => {
  window.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("PanelNetworkGuard", () => {
  it("panel API hatasını açıklamalı ve yeniden deneme eylemli modal olarak gösterir", async () => {
    window.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "Tesis verisi alınamadı." }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );
    renderGuard();

    await act(async () => {
      await window.fetch("/api/manager/hotels");
    });

    expect(await screen.findByRole("dialog", { name: "İşlem tamamlanamadı" })).toBeVisible();
    expect(screen.getByText("Tesis verisi alınamadı.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Sayfayı yenileyip tekrar dene" })).toBeVisible();
  });

  it("aynı gövdeli eşzamanlı mutasyonu API'ye yalnız bir kez gönderir", async () => {
    let resolveRequest!: (response: Response) => void;
    const native = vi.fn(() => new Promise<Response>((resolve) => { resolveRequest = resolve; }));
    window.fetch = native;
    renderGuard();
    const init = { method: "PATCH", body: JSON.stringify({ id: "booking-1" }) };

    const first = window.fetch("/api/manager/bookings", init);
    const second = window.fetch("/api/manager/bookings", init);
    resolveRequest(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await Promise.all([first, second]);
    await waitFor(() => expect(native).toHaveBeenCalledTimes(1));
  });
});

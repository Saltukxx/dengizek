import { MantineProvider } from "@mantine/core";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InquiryPortalClient } from "./portal-client";

function renderPortal() {
  return render(
    <MantineProvider>
      <InquiryPortalClient token="test-token" />
    </MantineProvider>,
  );
}

/** Gövdesi olmayan hata yanıtı — uçlar DB'ye ulaşamadığında böyle dönüyor. */
function emptyErrorResponse(status = 500) {
  return {
    ok: false,
    status,
    json: () => Promise.reject(new SyntaxError("Unexpected end of JSON input")),
  } as unknown as Response;
}

function jsonResponse(payload: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(payload) } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("InquiryPortalClient", () => {
  it("boş gövdeli 500'de sonsuz spinner yerine hata gösterir", async () => {
    // Regresyon: res.json() burada exception atıyordu; messages null kalınca
    // ekran kalıcı olarak yükleniyor durumunda takılıyordu.
    vi.stubGlobal("fetch", vi.fn(async () => emptyErrorResponse()));

    renderPortal();

    await waitFor(() => {
      expect(screen.getByText(/bağlantı kurulamadı/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Tekrar dene" })).toBeInTheDocument();
  });

  it("ağ hatasında da hata ekranına düşer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));

    renderPortal();

    await waitFor(() => {
      expect(screen.getByText(/bağlantı kurulamadı/i)).toBeInTheDocument();
    });
  });

  it("uçtan gelen hata mesajını olduğu gibi gösterir", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, error: "Bağlantının süresi doldu." })),
    );

    renderPortal();

    await waitFor(() => {
      expect(screen.getByText("Bağlantının süresi doldu.")).toBeInTheDocument();
    });
  });

  it("geçerli token'da mesajları listeler", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith("/review")) {
          return jsonResponse({ ok: true, review: null, canReview: false });
        }
        return jsonResponse({
          ok: true,
          inquiry: { name: "Deniz", status: "acik", hotelSlug: "aurelia-bay" },
          messages: [
            {
              id: "m1",
              senderRole: "hotel",
              senderName: "Aurelia Bay",
              body: "Talebiniz alındı.",
              createdAt: new Date("2026-01-01T10:00:00Z").toISOString(),
            },
          ],
        });
      }),
    );

    renderPortal();

    await waitFor(() => {
      expect(screen.getByText("Talebiniz alındı.")).toBeInTheDocument();
    });
    expect(screen.getByText(/Merhaba Deniz/)).toBeInTheDocument();
  });
});

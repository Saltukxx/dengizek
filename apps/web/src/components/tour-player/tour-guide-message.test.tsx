import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TourGuideMessage } from "./tour-guide-message";
import type { GuideMessage } from "@/lib/tour/use-tour-guide";

function renderMessage(message: GuideMessage) {
  return render(
    <MantineProvider>
      <TourGuideMessage message={message} />
    </MantineProvider>,
  );
}

describe("TourGuideMessage", () => {
  it("isThinking iken 'Düşünüyor…' gösterir, mesaj içeriğini göstermez", () => {
    renderMessage({ id: "m1", role: "assistant", content: "Merhaba", isThinking: true });
    expect(screen.getByText("Düşünüyor…")).toBeInTheDocument();
    expect(screen.queryByText("Merhaba")).not.toBeInTheDocument();
  });

  it("asistan mesajında persona baş harflerini gösterir", () => {
    render(
      <MantineProvider>
        <TourGuideMessage
          message={{ id: "m1", role: "assistant", content: "Hoş geldiniz." }}
          personaInitials="KB"
        />
      </MantineProvider>,
    );
    expect(screen.getByText("KB")).toBeInTheDocument();
    expect(screen.queryByText("AE")).not.toBeInTheDocument();
  });

  it("fiyat kartlarını satırlarıyla birlikte gösterir", () => {
    renderMessage({
      id: "m1",
      role: "assistant",
      content: "İşte fiyat bilgisi.",
      priceCards: [
        {
          roomSlug: "seaview-deluxe",
          roomName: "Deniz Manzaralı Deluxe",
          priceOnRequest: false,
          lines: [{ label: "Gecelik", value: "4.500 ₺" }],
        },
      ],
    });
    expect(screen.getByText("Deniz Manzaralı Deluxe")).toBeInTheDocument();
    expect(screen.getByText("4.500 ₺")).toBeInTheDocument();
  });

  it("'otel_ifadesi' fact kartında 'Otel ifadesi' rozetini gösterir (doğrulanmamış içerik uyarısı)", () => {
    renderMessage({
      id: "m1",
      role: "assistant",
      content: "Deniz manzarası hakkında.",
      factCards: [
        { kind: "otel_ifadesi", label: "Otel ifadesi", text: "Deniz manzarası eşsizdir." },
      ],
    });
    expect(screen.getByText("Otel ifadesi")).toBeInTheDocument();
    expect(screen.getByText("Deniz manzarası eşsizdir.")).toBeInTheDocument();
  });

  it("İngilizce yanıtta fact kartına 'Kaynak: Türkçe' notu ekler", () => {
    renderMessage({
      id: "m1",
      role: "assistant",
      content: "The check-in time is shown below, please see the card.",
      factCards: [{ kind: "verified", label: "Doğrulanmış bilgi", text: "Check-in saati: 14:00" }],
    });
    expect(screen.getByText("Kaynak: Türkçe")).toBeInTheDocument();
  });

  it("Türkçe yanıtta fact kartına dil notu eklemez", () => {
    renderMessage({
      id: "m1",
      role: "assistant",
      content: "Check-in saati kartta gösteriliyor.",
      factCards: [{ kind: "verified", label: "Doğrulanmış bilgi", text: "Check-in saati: 14:00" }],
    });
    expect(screen.queryByText("Kaynak: Türkçe")).not.toBeInTheDocument();
  });

  it("'verified' fact kartında 'Doğrulanmış bilgi' rozetini gösterir", () => {
    renderMessage({
      id: "m1",
      role: "assistant",
      content: "Check-in bilgisi.",
      factCards: [
        { kind: "verified", label: "Doğrulanmış bilgi", text: "Check-in saati: 14:00" },
      ],
    });
    expect(screen.getByText("Doğrulanmış bilgi")).toBeInTheDocument();
  });

  it("kullanıcı mesajında fiyat/fact kartı render edilmez (yalnızca asistan mesajlarında gösterilir)", () => {
    renderMessage({
      id: "m1",
      role: "user",
      content: "Fiyat ne kadar?",
      priceCards: [
        {
          roomSlug: "seaview-deluxe",
          roomName: "Deniz Manzaralı Deluxe",
          priceOnRequest: false,
          lines: [{ label: "Gecelik", value: "4.500 ₺" }],
        },
      ],
    });
    expect(screen.getByText("Fiyat ne kadar?")).toBeInTheDocument();
    expect(screen.queryByText("4.500 ₺")).not.toBeInTheDocument();
  });
});

import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GuideMessage } from "@/lib/tour/use-tour-guide";

const useSpeechInputMock = vi.fn();
vi.mock("./use-speech-input", () => ({
  useSpeechInput: (...args: unknown[]) => useSpeechInputMock(...args),
}));

const startListeningMock = vi.fn();
const stopListeningMock = vi.fn();

import { TourGuidePanel } from "./TourGuidePanel";

function renderPanel(overrides: Partial<Parameters<typeof TourGuidePanel>[0]> = {}) {
  const onSendMessage = vi.fn();
  const onChipClick = vi.fn();
  const onStartAutoTour = vi.fn();
  const onStopAutoTour = vi.fn();
  const utils = render(
    <MantineProvider>
      <TourGuidePanel
        messages={[]}
        isThinking={false}
        isAutoTour={false}
        onSendMessage={onSendMessage}
        onChipClick={onChipClick}
        onStartAutoTour={onStartAutoTour}
        onStopAutoTour={onStopAutoTour}
        {...overrides}
      />
    </MantineProvider>,
  );
  return { ...utils, onSendMessage, onChipClick, onStartAutoTour, onStopAutoTour };
}

beforeEach(() => {
  useSpeechInputMock.mockReset().mockReturnValue({
    isListening: false,
    isSupported: false,
    transcript: "",
    start: startListeningMock,
    stop: stopListeningMock,
  });
  startListeningMock.mockReset();
  stopListeningMock.mockReset();
});

describe("TourGuidePanel", () => {
  it("personaName verilmişse başlıkta ve avatarda kullanılır", () => {
    renderPanel({ personaName: "Aurelia Concierge" });
    expect(screen.getByText("Aurelia Concierge")).toBeInTheDocument();
    expect(screen.getByText("AC")).toBeInTheDocument();
  });

  it("personaName yoksa varsayılan rehber adı gösterilir", () => {
    renderPanel();
    expect(screen.getByText("Yapay Zeka Rehberi")).toBeInTheDocument();
  });

  it("mesaj yokken boş durum metnini gösterir", () => {
    renderPanel({ messages: [] });
    expect(screen.getByText("Rehberiniz hazırlanıyor…")).toBeInTheDocument();
  });

  it("detectedLanguage 'en' iken panel çerçevesi İngilizce olur ve STT dili en-US'e bağlanır", () => {
    useSpeechInputMock.mockReturnValue({
      isListening: false,
      isSupported: true,
      transcript: "",
      start: startListeningMock,
      stop: stopListeningMock,
    });
    renderPanel({ detectedLanguage: "en" });
    expect(screen.getByText("Your guide is getting ready…")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ask a question...")).toBeInTheDocument();
    expect(useSpeechInputMock).toHaveBeenCalledWith(
      expect.objectContaining({ lang: "en-US" }),
    );
  });

  it("detectedLanguage 'tr' iken STT dili tr-TR'ye bağlanır", () => {
    renderPanel({ detectedLanguage: "tr" });
    expect(useSpeechInputMock).toHaveBeenCalledWith(
      expect.objectContaining({ lang: "tr-TR" }),
    );
    expect(screen.getByText("Rehberiniz hazırlanıyor…")).toBeInTheDocument();
  });

  it("düşünürken boş durum metnini göstermez", () => {
    renderPanel({ messages: [], isThinking: true });
    expect(screen.queryByText("Rehberiniz hazırlanıyor…")).not.toBeInTheDocument();
  });

  it("yalnızca SON asistan mesajının chip'lerini gösterir", () => {
    const messages: GuideMessage[] = [
      { id: "m1", role: "assistant", content: "İlk mesaj", chips: ["Eski A", "Eski B"] },
      { id: "m2", role: "user", content: "Tamam" },
      { id: "m3", role: "assistant", content: "Son mesaj", chips: ["Yeni A", "Yeni B"] },
    ];
    renderPanel({ messages });
    expect(screen.getByRole("button", { name: "Yeni A" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eski A" })).not.toBeInTheDocument();
  });

  it("chip'e tıklayınca onChipClick doğru metinle çağrılır", () => {
    const messages: GuideMessage[] = [
      { id: "m1", role: "assistant", content: "Son mesaj", chips: ["Sahili gör"] },
    ];
    const { onChipClick } = renderPanel({ messages });
    fireEvent.click(screen.getByRole("button", { name: "Sahili gör" }));
    expect(onChipClick).toHaveBeenCalledWith("Sahili gör");
  });

  it("isThinking iken metin girişi devre dışı kalır", () => {
    renderPanel({ isThinking: true });
    const input = screen.getByPlaceholderText("Bir soru sorun...");
    expect(input).toBeDisabled();
  });

  it("Enter (Shift'siz) mesajı gönderir ve girişi temizler", () => {
    const { onSendMessage } = renderPanel();
    const input = screen.getByPlaceholderText("Bir soru sorun...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Fiyatlar ne kadar?" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSendMessage).toHaveBeenCalledWith("Fiyatlar ne kadar?");
    expect(input.value).toBe("");
  });

  it("Shift+Enter mesajı göndermez", () => {
    const { onSendMessage } = renderPanel();
    const input = screen.getByPlaceholderText("Bir soru sorun...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Yeni satır" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it("boş metinle gönderme yapılmaz", () => {
    const { onSendMessage } = renderPanel();
    const input = screen.getByPlaceholderText("Bir soru sorun...");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it("ses girişi desteklenmiyorsa mikrofon butonu gizlenir", () => {
    renderPanel();
    expect(screen.queryByLabelText("Sesli giriş")).not.toBeInTheDocument();
  });

  it("ses girişi destekleniyorsa mikrofon butonu görünür ve tıklayınca start() çağrılır", () => {
    useSpeechInputMock.mockReturnValue({
      isListening: false,
      isSupported: true,
      transcript: "",
      start: startListeningMock,
      stop: stopListeningMock,
    });
    renderPanel();
    const micButton = screen.getByLabelText("Sesli giriş");
    expect(micButton).toBeInTheDocument();
    fireEvent.click(micButton);
    expect(startListeningMock).toHaveBeenCalledTimes(1);
  });

  it("dinlerken mikrofon butonuna tıklayınca stop() çağrılır", () => {
    useSpeechInputMock.mockReturnValue({
      isListening: true,
      isSupported: true,
      transcript: "sahili gör",
      start: startListeningMock,
      stop: stopListeningMock,
    });
    renderPanel();
    const micButton = screen.getByLabelText("Sesli girişi durdur");
    fireEvent.click(micButton);
    expect(stopListeningMock).toHaveBeenCalledTimes(1);
  });
});

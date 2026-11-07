import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GuideMessage } from "@/lib/tour/use-tour-guide";

const useSpeechInputMock = vi.fn();
vi.mock("./use-speech-input", () => ({
  useSpeechInput: (...args: unknown[]) => useSpeechInputMock(...args),
}));

const useSpeechOutputMock = vi.fn();
vi.mock("./use-speech-output", () => ({
  useSpeechOutput: (...args: unknown[]) => useSpeechOutputMock(...args),
}));
const toggleSpeechMock = vi.fn();
const stopSpeechMock = vi.fn();

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
  useSpeechOutputMock.mockReset().mockReturnValue({
    isSupported: false,
    enabled: false,
    isSpeaking: false,
    drainCount: 0,
    isBusy: () => false,
    enable: vi.fn(),
    toggle: toggleSpeechMock,
    stop: stopSpeechMock,
    say: vi.fn(),
  });
  toggleSpeechMock.mockReset();
  stopSpeechMock.mockReset();
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

describe("sesli yanıt düğmesi", () => {
  const speechState = (enabled: boolean) => ({
    isSupported: true,
    enabled,
    isSpeaking: false,
    drainCount: 0,
    isBusy: () => false,
    enable: vi.fn(),
    toggle: toggleSpeechMock,
    stop: stopSpeechMock,
    say: vi.fn(),
  });

  it("desteklenmiyorsa düğme gösterilmez", () => {
    renderPanel();
    expect(screen.queryByLabelText("Sesli yanıtı aç")).not.toBeInTheDocument();
  });

  it("kapalıyken 'aç' düğmesi görünür, tıklayınca toggle çağrılır", () => {
    useSpeechOutputMock.mockReturnValue(speechState(false));
    renderPanel();
    const button = screen.getByLabelText("Sesli yanıtı aç");
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    expect(toggleSpeechMock).toHaveBeenCalledTimes(1);
  });

  it("açıkken 'kapat' etiketi ve basılı durum gösterilir", () => {
    useSpeechOutputMock.mockReturnValue(speechState(true));
    renderPanel();
    expect(screen.getByLabelText("Sesli yanıtı kapat")).toHaveAttribute("aria-pressed", "true");
  });

  it("yeni soru gönderilince okuma kesilir", () => {
    useSpeechOutputMock.mockReturnValue(speechState(true));
    const { onSendMessage } = renderPanel();
    const input = screen.getByPlaceholderText("Bir soru sorun...");
    fireEvent.change(input, { target: { value: "Havuz var mı?" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(stopSpeechMock).toHaveBeenCalled();
    expect(onSendMessage).toHaveBeenCalledWith("Havuz var mı?");
  });

  it("mikrofon açılınca okuma kesilir (rehber kendi sesini dinlemesin)", () => {
    useSpeechOutputMock.mockReturnValue(speechState(true));
    useSpeechInputMock.mockReturnValue({
      isListening: false,
      isSupported: true,
      transcript: "",
      start: startListeningMock,
      stop: stopListeningMock,
    });
    renderPanel();
    fireEvent.click(screen.getByLabelText("Sesli giriş"));
    expect(stopSpeechMock).toHaveBeenCalled();
    expect(startListeningMock).toHaveBeenCalledTimes(1);
  });
});

describe("sesli sohbet", () => {
  function enableVoice() {
    useSpeechOutputMock.mockReturnValue({
      isSupported: true,
      enabled: false,
      isSpeaking: false,
      drainCount: 0,
      isBusy: () => false,
      enable: vi.fn(),
      toggle: toggleSpeechMock,
      stop: stopSpeechMock,
    });
    useSpeechInputMock.mockReturnValue({
      isListening: false,
      isSupported: true,
      transcript: "",
      start: startListeningMock,
      stop: stopListeningMock,
      cancel: vi.fn(),
    });
  }

  it("mikrofon ya da ses yoksa 'Sesli sohbet' düğmesi gösterilmez", () => {
    renderPanel();
    expect(screen.queryByRole("button", { name: /Sesli sohbet/ })).not.toBeInTheDocument();
  });

  it("başlayınca yazı kutusunun yerine görüşme çubuğu gelir, 'Bitir' geri getirir", () => {
    enableVoice();
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Sesli sohbet/ }));

    expect(screen.getByText("Dinliyorum…")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Bir soru sorun...")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bitirdim" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Bitir$/ }));
    expect(screen.getByPlaceholderText("Bir soru sorun...")).toBeInTheDocument();
  });
});

describe("cevap değerlendirmesi (👍/👎)", () => {
  const messages: GuideMessage[] = [
    { id: "a0", role: "assistant", content: "Hoş geldiniz! Lobiden başlıyoruz." },
    { id: "u1", role: "user", content: "Giriş saati kaçta?" },
    { id: "a1", role: "assistant", content: "Check-in saati: 14:00. Ayrıntılar kartta." },
  ];

  it("yalnız misafir sorusuna verilen cevapta görünür; oy soru ve cevapla gider", () => {
    const onFeedback = vi.fn();
    renderPanel({ messages, onFeedback });
    // Tur anlatımında (a0) düğme yok, cevapta (a1) var.
    expect(screen.getAllByRole("button", { name: "Faydalı" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Faydalı değil" }));
    expect(onFeedback).toHaveBeenCalledWith({ messageId: "a1", rating: "down", question: "Giriş saati kaçta?", answer: "Check-in saati: 14:00. Ayrıntılar kartta." });
    expect(screen.getByText("Teşekkürler")).toBeTruthy();
    // Aynı oy tekrar gönderilmez; fikir değişebilir.
    fireEvent.click(screen.getByRole("button", { name: "Faydalı değil" }));
    fireEvent.click(screen.getByRole("button", { name: "Faydalı" }));
    expect(onFeedback).toHaveBeenCalledTimes(2);
    expect(onFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ rating: "up" }));
  });

  it("onFeedback verilmezse düğme gösterilmez", () => {
    renderPanel({ messages });
    expect(screen.queryByRole("button", { name: "Faydalı" })).toBeNull();
  });
});

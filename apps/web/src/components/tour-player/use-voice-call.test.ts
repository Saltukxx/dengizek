import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SpeechOutput } from "./use-speech-output";
import { FILLER_AFTER_MS, NO_REPLY_TIMEOUT_MS, useVoiceCall } from "./use-voice-call";

// --- Tarayıcı konuşma tanıma sahtesi ---------------------------------------

const recognitions: MockRecognition[] = [];

function track(instance: MockRecognition) {
  recognitions.push(instance);
  return true;
}

class MockRecognition {
  readonly tracked = track(this);
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event?: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn();
}

const current = () => recognitions[recognitions.length - 1]!;

/** Misafir bir şey söyleyip sustu. */
function say(text: string) {
  act(() => {
    const r = current();
    r.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: text } }] });
    r.onend?.();
  });
}

/** Hiçbir şey söylemeden sustu. */
function silence() {
  act(() => current().onend?.());
}

// --- Sesli yanıt sahtesi ------------------------------------------------------

function fakeOutput(overrides: Partial<SpeechOutput> = {}): SpeechOutput {
  return {
    isSupported: true,
    enabled: true,
    isSpeaking: false,
    drainCount: 0,
    isBusy: () => false,
    enable: vi.fn(),
    toggle: vi.fn(),
    stop: vi.fn(),
    say: vi.fn(),
    ...overrides,
  };
}

function setup(output = fakeOutput()) {
  const onSend = vi.fn();
  const hook = renderHook(
    (props: { output: SpeechOutput; isThinking: boolean; replyText?: string }) =>
      useVoiceCall({
        output: props.output,
        isThinking: props.isThinking,
        lang: "tr-TR",
        onSend,
        replyText: props.replyText,
        fillerText: "Bir saniye, bakıyorum.",
      }),
    { initialProps: { output, isThinking: false } as { output: SpeechOutput; isThinking: boolean; replyText?: string } },
  );
  return { ...hook, onSend };
}

beforeEach(() => {
  recognitions.length = 0;
  vi.stubGlobal("SpeechRecognition", MockRecognition);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// --- Testler -----------------------------------------------------------------

describe("useVoiceCall", () => {
  it("başlayınca sesli yanıtı açar ve dinlemeye başlar", () => {
    const output = fakeOutput();
    const { result } = setup(output);
    expect(result.current.isSupported).toBe(true);

    act(() => result.current.start());
    expect(output.enable).toHaveBeenCalled();
    expect(result.current.state).toBe("listening");
    expect(current().start).toHaveBeenCalled();
    expect(current().lang).toBe("tr-TR");
  });

  it("tam döngü: dinle → gönder → cevap → konuş → yeniden dinle", () => {
    let busy = false;
    const output = fakeOutput({ isBusy: () => busy });
    const { result, rerender, onSend } = setup(output);
    act(() => result.current.start());

    say("Havuz kaçta açılıyor?");
    expect(onSend).toHaveBeenCalledWith("Havuz kaçta açılıyor?");
    expect(result.current.state).toBe("thinking");

    rerender({ output, isThinking: true });
    expect(result.current.state).toBe("thinking");

    // Cevap bitti, son cümle okunuyor.
    busy = true;
    rerender({ output, isThinking: false });
    expect(result.current.state).toBe("speaking");
    const listenedBefore = recognitions.length;

    // Okuma bitti → yeniden dinler.
    busy = false;
    rerender({ output: { ...output, drainCount: 1 }, isThinking: false });
    expect(result.current.state).toBe("listening");
    expect(recognitions.length).toBe(listenedBefore + 1);
  });

  it("okunacak bir şey yoksa cevap biter bitmez yeniden dinler", () => {
    const output = fakeOutput();
    const { result, rerender } = setup(output);
    act(() => result.current.start());
    say("Merhaba");
    rerender({ output, isThinking: true });
    rerender({ output, isThinking: false });
    expect(result.current.state).toBe("listening");
  });

  it("bir kez sessizlikte yeniden dinler, ikincisinde beklemeye geçer", () => {
    const { result, onSend } = setup();
    act(() => result.current.start());

    silence();
    expect(result.current.state).toBe("listening");
    silence();
    expect(result.current.state).toBe("paused");
    expect(onSend).not.toHaveBeenCalled();

    act(() => result.current.tap());
    expect(result.current.state).toBe("listening");
  });

  it("dinlerken 'Bitirdim' duyulanı hemen gönderir", () => {
    const { result, onSend } = setup();
    act(() => result.current.start());
    act(() => {
      current().onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: "Kahvaltı dahil mi" } }] });
    });
    expect(result.current.transcript).toBe("Kahvaltı dahil mi");

    act(() => result.current.tap());
    expect(onSend).toHaveBeenCalledWith("Kahvaltı dahil mi");
  });

  it("konuşurken 'Sözünü kes' okumayı durdurup dinler", () => {
    const output = fakeOutput({ isBusy: () => true });
    const { result, rerender } = setup(output);
    act(() => result.current.start());
    say("Spa var mı?");
    rerender({ output, isThinking: true });
    rerender({ output, isThinking: false });
    expect(result.current.state).toBe("speaking");

    act(() => result.current.tap());
    expect(output.stop).toHaveBeenCalled();
    expect(result.current.state).toBe("listening");
  });

  it("mikrofon izni yoksa görüşme kapanır ve hata gösterilir", () => {
    const { result } = setup();
    act(() => result.current.start());
    act(() => {
      current().onerror?.({ error: "not-allowed" });
      current().onend?.();
    });
    expect(result.current.state).toBe("off");
    expect(result.current.error).toBe("mic-denied");
  });

  it("'Bitir' dinlemeyi duyulanı göndermeden keser", () => {
    const output = fakeOutput();
    const { result, onSend } = setup(output);
    act(() => result.current.start());
    const recognition = current();

    act(() => result.current.end());
    expect(result.current.state).toBe("off");
    expect(recognition.abort).toHaveBeenCalled();
    expect(output.stop).toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("soru gönderilmezse (ör. deneme hakkı doldu) takılı kalmaz, beklemeye geçer", () => {
    vi.useFakeTimers();
    const { result } = setup();
    act(() => result.current.start());
    say("Bir soru daha");
    expect(result.current.state).toBe("thinking");

    act(() => vi.advanceTimersByTime(NO_REPLY_TIMEOUT_MS));
    expect(result.current.state).toBe("paused");
  });

  it("cevap gecikirse bir kez 'bakıyorum' der", () => {
    vi.useFakeTimers();
    const output = fakeOutput();
    const { result, rerender } = setup(output);
    act(() => result.current.start());
    say("Spa kaçta kapanıyor?");
    rerender({ output, isThinking: true, replyText: "" });

    act(() => vi.advanceTimersByTime(FILLER_AFTER_MS));
    expect(output.say).toHaveBeenCalledTimes(1);
    expect(output.say).toHaveBeenCalledWith("Bir saniye, bakıyorum.");
    act(() => vi.advanceTimersByTime(10_000));
    expect(output.say).toHaveBeenCalledTimes(1);
  });

  it("cevap zamanında başladıysa bekleme sözü söylenmez", () => {
    vi.useFakeTimers();
    const output = fakeOutput();
    const { result, rerender } = setup(output);
    act(() => result.current.start());
    say("Spa kaçta kapanıyor?");
    rerender({ output, isThinking: true, replyText: "Spa akşam" });

    act(() => vi.advanceTimersByTime(FILLER_AFTER_MS));
    expect(output.say).not.toHaveBeenCalled();
  });

  it("konuşma tanıma yoksa desteklenmez", () => {
    vi.unstubAllGlobals();
    const { result } = setup();
    expect(result.current.isSupported).toBe(false);
  });
});

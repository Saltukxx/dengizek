import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSpeechInput } from "./use-speech-input";

let lastInstance: MockSpeechRecognition | null = null;

class MockSpeechRecognition {
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: ((event: unknown) => void) | null = null;
  onerror: (() => void) | null = null;
  onend: (() => void) | null = null;
  start: () => void;
  stop: () => void;

  constructor() {
    this.start = vi.fn();
    this.stop = vi.fn(() => this.onend?.());
    // Test'lerin son üretilen instance'a erişip onresult/onerror'ı manuel
    // tetikleyebilmesi için kasıtlı yakalama.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    lastInstance = this;
  }
}

beforeEach(() => {
  lastInstance = null;
  vi.stubGlobal("SpeechRecognition", MockSpeechRecognition);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useSpeechInput", () => {
  it("SpeechRecognition mevcutsa isSupported true olur", () => {
    const { result } = renderHook(() => useSpeechInput());
    expect(result.current.isSupported).toBe(true);
  });

  it("SpeechRecognition yoksa isSupported false olur, start no-op'tur", () => {
    vi.unstubAllGlobals();
    const { result } = renderHook(() => useSpeechInput());
    expect(result.current.isSupported).toBe(false);
    act(() => result.current.start());
    expect(result.current.isListening).toBe(false);
  });

  it("start() dinlemeyi başlatır ve recognition.start() çağrılır", () => {
    const { result } = renderHook(() => useSpeechInput({ lang: "tr-TR" }));
    act(() => result.current.start());
    expect(result.current.isListening).toBe(true);
    expect(lastInstance?.start).toHaveBeenCalledTimes(1);
    expect(lastInstance?.lang).toBe("tr-TR");
  });

  it("onresult tetiklendiğinde transcript güncellenir ve onResult çağrılır", () => {
    const onResult = vi.fn();
    const { result } = renderHook(() => useSpeechInput({ lang: "tr-TR", onResult }));
    act(() => result.current.start());

    act(() => {
      lastInstance?.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: false, 0: { transcript: "sahili gör" } }],
      });
    });

    expect(result.current.transcript).toBe("sahili gör");
    expect(onResult).toHaveBeenCalledWith("sahili gör", false);
  });

  it("stop() dinlemeyi durdurur", () => {
    const { result } = renderHook(() => useSpeechInput());
    act(() => result.current.start());
    act(() => result.current.stop());
    expect(result.current.isListening).toBe(false);
    expect(lastInstance?.stop).toHaveBeenCalledTimes(1);
  });

  it("recognition.onerror tetiklenince isListening false olur", () => {
    const { result } = renderHook(() => useSpeechInput());
    act(() => result.current.start());
    act(() => {
      lastInstance?.onerror?.();
    });
    expect(result.current.isListening).toBe(false);
  });
});

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GuideMessage } from "@/lib/tour/use-tour-guide";
import { useSpeechOutput } from "./use-speech-output";

// --- Tarayıcı ses API'leri için sahteler -----------------------------------

let audio: MockAudio | null = null;
const playedSrcs: string[] = [];

function trackAudio(instance: MockAudio) {
  audio = instance;
  return true;
}

class MockAudio {
  readonly tracked = trackAudio(this);
  src = "";
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pause = vi.fn();
  play() {
    playedSrcs.push(this.src);
    return Promise.resolve();
  }
}

class MockUtterance {
  lang = "";
  voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

const spoken: MockUtterance[] = [];
const speechSynthesisMock = {
  speak: vi.fn((u: MockUtterance) => {
    if (u.text) spoken.push(u);
  }),
  cancel: vi.fn(),
  getVoices: () => [],
};

const fetchMock = vi.fn();
let blobCounter = 0;

beforeEach(() => {
  audio = null;
  playedSrcs.length = 0;
  spoken.length = 0;
  blobCounter = 0;
  speechSynthesisMock.speak.mockClear();
  speechSynthesisMock.cancel.mockClear();
  fetchMock.mockReset().mockImplementation(async () => new Response(new Blob(["wav"]), { status: 200 }));
  vi.stubGlobal("Audio", MockAudio);
  vi.stubGlobal("SpeechSynthesisUtterance", MockUtterance);
  vi.stubGlobal("speechSynthesis", speechSynthesisMock);
  vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = vi.fn(() => `blob:ses-${++blobCounter}`);
  URL.revokeObjectURL = vi.fn();
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// --- Yardımcılar -------------------------------------------------------------

const assistant = (id: string, content: string): GuideMessage => ({ id, role: "assistant", content });

function setup(initial: GuideMessage[] = [], language?: string) {
  return renderHook((props: { messages: GuideMessage[]; isThinking: boolean }) =>
    useSpeechOutput({ ...props, language }),
  { initialProps: { messages: initial, isThinking: false } });
}

const sentTexts = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).text as string);

/** Çalan sesi bitir — sıradaki cümleye geçilsin. */
async function finishCurrentClip() {
  await act(async () => {
    audio?.onended?.();
  });
}

// --- Testler -----------------------------------------------------------------

describe("useSpeechOutput", () => {
  it("varsayılan kapalıdır; açılmadan hiçbir şey okunmaz", async () => {
    const { result, rerender } = setup();
    expect(result.current.isSupported).toBe(true);
    expect(result.current.enabled).toBe(false);
    rerender({ messages: [assistant("a1", "Merhaba.")], isThinking: false });
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("açıldığında ekrandaki eski cevaplar okunmaz, yeniler okunur", async () => {
    const old = [assistant("a0", "Eski cevap.")];
    const { result, rerender } = setup(old);
    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(true);

    rerender({ messages: [...old, assistant("a1", "Yeni cevap.")], isThinking: false });
    await waitFor(() => expect(sentTexts()).toEqual(["Yeni cevap."]));
  });

  it("cevap akarken biten cümleler hemen, son parça cevap bitince okunur", async () => {
    const { result, rerender } = setup();
    act(() => result.current.toggle());

    rerender({ messages: [assistant("a1", "Kahvaltı dahildir. Havuz")], isThinking: true });
    await waitFor(() => expect(sentTexts()).toEqual(["Kahvaltı dahildir."]));
    await waitFor(() => expect(playedSrcs).toContain("blob:ses-1"));

    rerender({ messages: [assistant("a1", "Kahvaltı dahildir. Havuz 09:00'da açılır.")], isThinking: false });
    await waitFor(() => expect(sentTexts()).toEqual(["Kahvaltı dahildir.", "Havuz 9'da açılır."]));

    // İkinci ses, birincisi bitmeden çalmaz.
    expect(playedSrcs).not.toContain("blob:ses-2");
    await finishCurrentClip();
    await waitFor(() => expect(playedSrcs).toContain("blob:ses-2"));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:ses-1");
  });

  it("akış sürerken noktayla biten son cümle kısa bir duraklamadan sonra okunur", async () => {
    const { result, rerender } = setup();
    act(() => result.current.toggle());
    rerender({ messages: [assistant("a1", "Kahvaltı dahildir. Havuz açıktır.")], isThinking: true });
    await waitFor(() => expect(sentTexts()).toEqual(["Kahvaltı dahildir."]));
    await waitFor(() => expect(sentTexts()).toEqual(["Kahvaltı dahildir.", "Havuz açıktır."]), { timeout: 2000 });

    // Akış bitince aynı cümle ikinci kez okunmaz.
    rerender({ messages: [assistant("a1", "Kahvaltı dahildir. Havuz açıktır.")], isThinking: false });
    await new Promise((r) => setTimeout(r, 50));
    expect(sentTexts()).toHaveLength(2);
  });

  it("'12.' gibi sayı ortası olabilecek son erken okunmaz", async () => {
    const { result, rerender } = setup();
    act(() => result.current.toggle());
    rerender({ messages: [assistant("a1", "Gecelik fiyat 12.")], isThinking: true });
    await new Promise((r) => setTimeout(r, 900));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sunucu sesi yoksa (503) tarayıcı sesine geçer ve bir daha sunucuyu denemez", async () => {
    fetchMock.mockImplementation(async () => new Response("{}", { status: 503 }));
    const { result, rerender } = setup();
    act(() => result.current.toggle());

    rerender({ messages: [assistant("a1", "Birinci cümle. İkinci cümle.")], isThinking: false });
    await waitFor(() => expect(spoken.map((u) => u.text)).toEqual(["Birinci cümle."]));
    expect(spoken[0]!.lang).toBe("tr-TR");

    await act(async () => spoken[0]!.onend?.());
    await waitFor(() => expect(spoken.map((u) => u.text)).toEqual(["Birinci cümle.", "İkinci cümle."]));

    // Aynı anda istenen iki cümle sunucuyu denemiş olabilir; hatadan sonraki cevap denemez.
    const callsAfterFailure = fetchMock.mock.calls.length;
    await act(async () => spoken[1]!.onend?.());
    rerender({
      messages: [assistant("a1", "Birinci cümle. İkinci cümle."), assistant("a2", "Üçüncü.")],
      isThinking: false,
    });
    await waitFor(() => expect(spoken.map((u) => u.text)).toContain("Üçüncü."));
    expect(fetchMock).toHaveBeenCalledTimes(callsAfterFailure);
  });

  it("İngilizce sohbette doğrudan tarayıcı sesi kullanılır", async () => {
    const { result, rerender } = setup([], "en");
    act(() => result.current.toggle());
    rerender({ messages: [assistant("a1", "Breakfast is included.")], isThinking: false });
    await waitFor(() => expect(spoken.map((u) => u.text)).toEqual(["Breakfast is included."]));
    expect(spoken[0]!.lang).toBe("en-US");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stop() okumayı keser ve sıradaki cümleleri atar", async () => {
    const { result, rerender } = setup();
    act(() => result.current.toggle());
    rerender({ messages: [assistant("a1", "Bir. İki. Üç.")], isThinking: false });
    await waitFor(() => expect(playedSrcs).toContain("blob:ses-1"));

    act(() => result.current.stop());
    expect(audio!.pause).toHaveBeenCalled();
    expect(speechSynthesisMock.cancel).toHaveBeenCalled();

    await finishCurrentClip();
    await new Promise((r) => setTimeout(r, 0));
    expect(playedSrcs.filter((s) => s.startsWith("blob:"))).toEqual(["blob:ses-1"]);
  });

  it("kapatılınca yeni cevaplar okunmaz ve tercih hatırlanır", async () => {
    const { result, rerender, unmount } = setup();
    act(() => result.current.toggle());
    expect(window.localStorage.getItem("er-voice-reply")).toBe("1");
    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(false);
    expect(window.localStorage.getItem("er-voice-reply")).toBe("0");

    rerender({ messages: [assistant("a1", "Okunmamalı.")], isThinking: false });
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).not.toHaveBeenCalled();
    unmount();

    window.localStorage.setItem("er-voice-reply", "1");
    const again = setup();
    expect(again.result.current.enabled).toBe(true);
  });
});

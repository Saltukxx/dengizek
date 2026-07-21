import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGuestSession } from "@/lib/tour/use-guest-session";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useGuestSession", () => {
  it("mount'ta bir sessionToken üretir ve localStorage'a yazar", async () => {
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ ok: true, found: false }) });
    renderHook(() => useGuestSession("aurelia-bay", "demo-lobby"));
    await act(async () => {});
    const token = window.localStorage.getItem("dengizek_guest_session");
    expect(token).toBeTruthy();
  });

  it("aynı tarayıcıda ikinci mount'ta AYNI token'ı yeniden kullanır", async () => {
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ ok: true, found: false }) });
    renderHook(() => useGuestSession("aurelia-bay", "demo-lobby"));
    await act(async () => {});
    const firstToken = window.localStorage.getItem("dengizek_guest_session");

    renderHook(() => useGuestSession("aurelia-bay", "demo-lobby"));
    await act(async () => {});
    expect(window.localStorage.getItem("dengizek_guest_session")).toBe(firstToken);
  });

  it("sunucuda geçmiş bulunursa resumeAvailable dolar", async () => {
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ ok: true, found: true, stepsSeen: ["s1", "s2"], lastStepId: "s2" }),
    });
    const { result } = renderHook(() => useGuestSession("aurelia-bay", "demo-lobby"));
    await act(async () => {});
    expect(result.current.resumeAvailable).toEqual({ stepsSeen: ["s1", "s2"], lastStepId: "s2" });
  });

  it("geçmiş yoksa resumeAvailable null kalır", async () => {
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ ok: true, found: false }) });
    const { result } = renderHook(() => useGuestSession("aurelia-bay", "demo-lobby"));
    await act(async () => {});
    expect(result.current.resumeAvailable).toBeNull();
  });

  it("dismissResume çağrıldığında resumeAvailable temizlenir", async () => {
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ ok: true, found: true, stepsSeen: ["s1"], lastStepId: "s1" }),
    });
    const { result } = renderHook(() => useGuestSession("aurelia-bay", "demo-lobby"));
    await act(async () => {});
    expect(result.current.resumeAvailable).not.toBeNull();
    act(() => result.current.dismissResume());
    expect(result.current.resumeAvailable).toBeNull();
  });

  it("persistProgress debounce ile PATCH gönderir", async () => {
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ ok: true, found: false }) });
    const { result } = renderHook(() => useGuestSession("aurelia-bay", "demo-lobby"));
    await act(async () => {}); // mount GET'i tüket
    fetchMock.mockClear();

    act(() => result.current.persistProgress(["s1"], "s1"));
    // Debounce süresi dolmadan istek gitmemeli
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/tour/session");
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      hotelSlug: "aurelia-bay",
      tourId: "demo-lobby",
      stepsSeen: ["s1"],
      lastStepId: "s1",
    });
  });

  it("art arda persistProgress çağrıları tek isteğe indirgenir (debounce)", async () => {
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ ok: true, found: false }) });
    const { result } = renderHook(() => useGuestSession("aurelia-bay", "demo-lobby"));
    await act(async () => {});
    fetchMock.mockClear();

    act(() => {
      result.current.persistProgress(["s1"], "s1");
      result.current.persistProgress(["s1", "s2"], "s2");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse((init as RequestInit).body as string).stepsSeen).toEqual(["s1", "s2"]);
  });

  it("boş stepsSeen ile persistProgress istek göndermez", async () => {
    fetchMock.mockResolvedValue({ json: () => Promise.resolve({ ok: true, found: false }) });
    const { result } = renderHook(() => useGuestSession("aurelia-bay", "demo-lobby"));
    await act(async () => {});
    fetchMock.mockClear();

    act(() => result.current.persistProgress([], null));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

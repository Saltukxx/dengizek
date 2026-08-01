import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAutoTourTargetStepId, useTourGuide } from "@/lib/tour/use-tour-guide";
import type { TourManifest } from "@/lib/schemas/tour-manifest";

// ---------------------------------------------------------------------------
// @ai-sdk/react ve ai mock'ları — gerçek ağ isteği/streaming yok. vi.mock
// factory'leri hoisted olduğundan, içeride kullanılan tüm değişkenler
// vi.hoisted() ile tanımlanmalı (aksi halde TDZ hatası alınır).
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  return {
    chatState: {
      messages: [] as unknown[],
      status: "ready" as "ready" | "submitted" | "streaming",
    },
    sendMessageMock: vi.fn().mockResolvedValue(undefined),
    onToolCallRef: {
      current: null as ((args: { toolCall: { toolName: string; input: unknown } }) => void) | null,
    },
  };
});

vi.mock("@ai-sdk/react", () => ({
  useChat: (opts: { onToolCall?: (args: { toolCall: { toolName: string; input: unknown } }) => void }) => {
    mocks.onToolCallRef.current = opts.onToolCall ?? null;
    return {
      messages: mocks.chatState.messages,
      sendMessage: mocks.sendMessageMock,
      status: mocks.chatState.status,
    };
  },
}));

vi.mock("ai", () => ({
  DefaultChatTransport: class DefaultChatTransport {},
}));

const trackEventMock = vi.fn();
vi.mock("@/lib/analytics-client", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

const manifest: TourManifest = {
  tourId: "demo-lobby",
  hotelSlug: "aurelia-bay",
  version: 1,
  steps: [
    {
      stepId: "s1",
      order: 0,
      kind: "lobby",
      title: "Lobi",
      requiresUserContinue: true,
      media: { mode: "clip", src: "/demo/1.mp4" },
      aiVisible: true,
    },
    {
      stepId: "s2",
      order: 1,
      kind: "amenity_spot",
      title: "Sahil",
      requiresUserContinue: false,
      media: { mode: "clip", src: "/demo/2.mp4" },
      aiVisible: true,
    },
  ],
};

function setup(overrides: Partial<Parameters<typeof useTourGuide>[0]> = {}) {
  const onNavigate = vi.fn();
  const onOpenInquiry = vi.fn();
  const onAutoTourEnd = vi.fn();
  const view = renderHook(
    (props: { stepsSeen: string[] }) =>
      useTourGuide({
        manifest,
        currentStep: manifest.steps[0]!,
        stepsSeen: props.stepsSeen,
        onNavigate,
        onOpenInquiry,
        onAutoTourEnd,
        idleTimeoutMs: 1000,
        maxNudges: 3,
        ...overrides,
      }),
    { initialProps: { stepsSeen: ["s1"] } },
  );
  return { ...view, onNavigate, onOpenInquiry, onAutoTourEnd };
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.chatState.messages = [];
  mocks.chatState.status = "ready";
  mocks.sendMessageMock.mockClear();
  mocks.onToolCallRef.current = null;
  trackEventMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useTourGuide — idle nudge", () => {
  it("idleTimeoutMs sonunda idle tetikleyicisi gönderir", async () => {
    setup();
    // mount effect'i tourStart gönderir (senkron, timer içermez) — sadece
    // mikrotask'ları akıt; idle timer'ı (1000ms, henüz bekleyen) ERKEN
    // ateşlememek için vi.runOnlyPendingTimersAsync KULLANMA.
    await act(async () => {});
    mocks.sendMessageMock.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(mocks.sendMessageMock).toHaveBeenCalledWith(
      { text: "[HIDDEN]" },
      expect.objectContaining({ body: expect.objectContaining({ triggerReason: "idle" }) }),
    );
  });

  it("maxNudges aşılınca proaktif tetikleyici artık göndermez", async () => {
    setup({ maxNudges: 1 });
    // tourStart -> 1. nudge sayılır (nudgeCount 1'e çıkar); idle timer'ı
    // erken ateşlememek için yalnızca mikrotask'ları akıt.
    await act(async () => {});
    mocks.sendMessageMock.mockClear();

    // idle timer (hâlâ bekleyen) ateşlenir ama nudgeCount(1) >= maxNudges(1)
    // guard'ı trigger() içinde erken çıkış yaptırır — sendMessage çağrılmaz.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(mocks.sendMessageMock).not.toHaveBeenCalled();
  });
});

describe("useTourGuide — onToolCall yan etkileri", () => {
  it("navigateTo çağrılınca onNavigate tetiklenir", async () => {
    const { onNavigate } = setup();
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    act(() => {
      mocks.onToolCallRef.current?.({ toolCall: { toolName: "navigateTo", input: { stepId: "s2" } } });
    });
    expect(onNavigate).toHaveBeenCalledWith("s2");
  });

  it("autoTourNext gecikmeden sonra onNavigate'i sunucunun nextStepId'siyle çağırır", async () => {
    const { onNavigate, result } = setup();
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    // autoTourNext yalnızca otomatik tur aktifken ilerletir (plan: "Sadece
    // isAutoTour=true iken kullan") — önce turu başlat.
    act(() => result.current.startAutoTour());
    onNavigate.mockClear();

    act(() => {
      mocks.onToolCallRef.current?.({
        toolCall: { toolName: "autoTourNext", input: { stepId: "model-tahmini", delayMs: 500 } },
      });
    });
    expect(onNavigate).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    // currentStep s1 -> sunucu nextStepId s2'yi döner (stepsSeen ["s1"])
    expect(onNavigate).toHaveBeenCalledWith("s2");
  });

  it("otomatik tur KAPALIYKEN autoTourNext videoyu kaçırmaz", async () => {
    const { onNavigate } = setup();
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    act(() => {
      mocks.onToolCallRef.current?.({
        toolCall: { toolName: "autoTourNext", input: { stepId: "s2", delayMs: 100 } },
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("tur durdurulduktan sonra bekleyen autoTourNext ilerletmez", async () => {
    const { onNavigate, result } = setup();
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    act(() => result.current.startAutoTour());
    onNavigate.mockClear();

    act(() => {
      mocks.onToolCallRef.current?.({
        toolCall: { toolName: "autoTourNext", input: { stepId: "s2", delayMs: 500 } },
      });
    });
    // Gecikme dolmadan kullanıcı "Durdur" der.
    act(() => result.current.stopAutoTour());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("endAutoTour otomatik turu durdurur ve onAutoTourEnd çağırır", async () => {
    const { onAutoTourEnd } = setup();
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    act(() => {
      mocks.onToolCallRef.current?.({ toolCall: { toolName: "endAutoTour", input: {} } });
    });
    expect(onAutoTourEnd).toHaveBeenCalledTimes(1);
    expect(trackEventMock).toHaveBeenCalledWith(
      "tour_auto_end",
      expect.anything(),
      "aurelia-bay",
    );
  });

  it("suggestNext hiçbir yan etki tetiklemez (chip'ler mesaj içinden okunur)", async () => {
    const { onNavigate, onOpenInquiry, onAutoTourEnd } = setup();
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    act(() => {
      mocks.onToolCallRef.current?.({ toolCall: { toolName: "suggestNext", input: { chips: ["A", "B"] } } });
    });
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onOpenInquiry).not.toHaveBeenCalled();
    expect(onAutoTourEnd).not.toHaveBeenCalled();
  });
});

describe("useTourGuide — mesaj eşleme", () => {
  it("[HIDDEN] metinli mesajları görünür listeden filtreler", async () => {
    mocks.chatState.messages = [
      { id: "m1", role: "assistant", parts: [{ type: "text", text: "[HIDDEN]" }] },
      { id: "m2", role: "assistant", parts: [{ type: "text", text: "Merhaba!" }] },
    ];
    const { result } = setup();
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    const visible = result.current.messages.map((m) => m.content);
    expect(visible).not.toContain("[HIDDEN]");
    expect(visible).toContain("Merhaba!");
  });

  it("openInquiry blocked ise yerel bir uyarı mesajı ekler ve onOpenInquiry çağırmaz", async () => {
    mocks.chatState.messages = [
      {
        id: "m1",
        role: "assistant",
        parts: [
          {
            type: "tool-openInquiry",
            state: "output-available",
            input: { roomSlug: "deluxe" },
            output: { ok: false, blocked: true },
          },
        ],
      },
    ];
    const { result, onOpenInquiry, rerender } = setup();
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    rerender({ stepsSeen: ["s1"] });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(onOpenInquiry).not.toHaveBeenCalled();
    expect(result.current.messages.some((m) => m.content.includes("Tur henüz bitmedi"))).toBe(true);
  });

  it("openInquiry ok ise onOpenInquiry roomSlug ile çağrılır", async () => {
    mocks.chatState.messages = [
      {
        id: "m1",
        role: "assistant",
        parts: [
          {
            type: "tool-openInquiry",
            state: "output-available",
            input: { roomSlug: "deluxe" },
            output: { ok: true },
          },
        ],
      },
    ];
    const { onOpenInquiry, rerender } = setup();
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    rerender({ stepsSeen: ["s1"] });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(onOpenInquiry).toHaveBeenCalledWith("deluxe", true);
  });
});

describe("useTourGuide — chip reddi bastırması", () => {
  const assistantWithChips = (id: string, chips: string[]) => ({
    id,
    role: "assistant",
    parts: [
      { type: "text", text: "Size bir önerim var." },
      { type: "tool-suggestNext", input: { chips } },
    ],
  });

  it("üst üste 2 chip seti yok sayılınca chip önerileri gizlenir", async () => {
    mocks.chatState.messages = [assistantWithChips("a1", ["Sahili gör"])];
    const { result, rerender } = setup();
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    // 1. reddetme: chip yerine serbest mesaj
    await act(async () => {
      await result.current.sendMessage("Kendi sorum var");
    });
    // Yeni bir chip seti sunulur
    mocks.chatState.messages = [...mocks.chatState.messages, assistantWithChips("a2", ["Havuzu gör"])];
    rerender({ stepsSeen: ["s1"] });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    // Henüz bastırılmadı — a2'nin chip'leri görünür
    expect(result.current.messages.some((m) => m.chips?.length)).toBe(true);

    // 2. reddetme
    await act(async () => {
      await result.current.sendMessage("Yine başka bir soru");
    });
    mocks.chatState.messages = [...mocks.chatState.messages, assistantWithChips("a3", ["Spa'yı gör"])];
    rerender({ stepsSeen: ["s1"] });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current.messages.every((m) => !m.chips?.length)).toBe(true);
  });

  it("chip'e tıklamak (chip metnini göndermek) red sayacını sıfırlar", async () => {
    mocks.chatState.messages = [assistantWithChips("a1", ["Sahili gör"])];
    const { result, rerender } = setup();
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    // 1. reddetme
    await act(async () => {
      await result.current.sendMessage("Kendi sorum var");
    });
    mocks.chatState.messages = [...mocks.chatState.messages, assistantWithChips("a2", ["Havuzu gör"])];
    rerender({ stepsSeen: ["s1"] });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    // Chip'e tıklama — sayaç sıfırlanır
    await act(async () => {
      result.current.handleChipClick("Havuzu gör");
      await vi.runOnlyPendingTimersAsync();
    });
    mocks.chatState.messages = [...mocks.chatState.messages, assistantWithChips("a3", ["Spa'yı gör"])];
    rerender({ stepsSeen: ["s1"] });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    // 1 reddetme daha — sayaç sıfırlandığı için hâlâ bastırılmamalı
    await act(async () => {
      await result.current.sendMessage("Başka bir konu");
    });
    mocks.chatState.messages = [...mocks.chatState.messages, assistantWithChips("a4", ["Restoranı gör"])];
    rerender({ stepsSeen: ["s1"] });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current.messages.some((m) => m.chips?.length)).toBe(true);
  });
});

describe("useTourGuide — analytics dedup", () => {
  it("aynı mesaj için ai_tool_price yalnızca bir kez izlenir", async () => {
    mocks.chatState.messages = [
      {
        id: "m1",
        role: "assistant",
        parts: [{ type: "tool-getRoomPrice", output: { ok: true, cards: [] } }],
      },
    ];
    const { rerender } = setup();
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    rerender({ stepsSeen: ["s1"] });
    rerender({ stepsSeen: ["s1"] });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    const priceCalls = trackEventMock.mock.calls.filter((c) => c[0] === "ai_tool_price");
    expect(priceCalls).toHaveLength(1);
  });
});

describe("resolveAutoTourTargetStepId", () => {
  it("sunucu nextStepId varsa onu kullanır", () => {
    expect(resolveAutoTourTargetStepId("s9", "s2")).toBe("s2");
  });

  it("sunucu nextStepId yoksa model adımını kullanır", () => {
    expect(resolveAutoTourTargetStepId("s3", null)).toBe("s3");
  });
});

// ---------------------------------------------------------------------------
// AI–video senkronu: adım başına TEK anlatım
//
// Otomatik turda adımı AI ilerletir ve o yanıtla birlikte zaten narasyon yazar.
// Adım değişiminin ayrıca stepStart tetiklemesi ikinci bir anlatım demekti —
// token maliyeti iki katına çıkıyor ve ikinci mesaj yeni video oynarken düşüyordu.
// ---------------------------------------------------------------------------

describe("useTourGuide — adım başına tek anlatım", () => {
  it("AI'ın ilerlettiği adımda stepStart tetiklenmez", async () => {
    const { result } = setup();
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    act(() => result.current.startAutoTour());
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    mocks.sendMessageMock.mockClear();

    // AI "s2"ye geçiriyor…
    act(() => {
      mocks.onToolCallRef.current?.({
        toolCall: { toolName: "navigateTo", input: { stepId: "s2" } },
      });
    });
    // …ve oynatıcı adım değişimini bildiriyor.
    act(() => result.current.notifyStepStart("s2"));
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(mocks.sendMessageMock).not.toHaveBeenCalled();
  });

  it("kullanıcı elle geçtiğinde stepStart tetiklenir", async () => {
    const { result } = setup();
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    mocks.sendMessageMock.mockClear();

    act(() => result.current.notifyStepStart("s2"));
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(mocks.sendMessageMock).toHaveBeenCalled();
  });

  it("AI geçişinden sonraki İKİNCİ adımda tekrar tetiklenir (bayrak tek sefer)", async () => {
    const { result } = setup();
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    act(() => result.current.startAutoTour());
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    act(() => {
      mocks.onToolCallRef.current?.({
        toolCall: { toolName: "navigateTo", input: { stepId: "s2" } },
      });
    });
    act(() => result.current.notifyStepStart("s2"));
    mocks.sendMessageMock.mockClear();

    // Kullanıcı bundan sonra elle başka adıma geçerse anlatım yeniden gelmeli.
    act(() => result.current.notifyStepStart("s1"));
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(mocks.sendMessageMock).toHaveBeenCalled();
  });
});

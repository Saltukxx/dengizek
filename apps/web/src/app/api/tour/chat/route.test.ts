// ---------------------------------------------------------------------------
// AI tur sohbeti route testleri — UI message stream sürümü
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryRoomPricesMock = vi.fn().mockResolvedValue({ ok: true, cards: [] });

vi.mock("@/lib/ai/price-engine", () => ({
  queryRoomPrices: (...args: unknown[]) => queryRoomPricesMock(...args),
}));

const streamTextMock = vi.fn();
vi.mock("ai", () => ({
  streamText: (...args: unknown[]) => streamTextMock(...args),
  tool: (def: unknown) => def,
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: () => () => "mock-model",
}));

import { POST } from "./route";

const baseBody = {
  messages: [{ role: "user", content: "Sahili görmek istiyorum" }],
  hotelSlug: "aurelia-bay",
  tourId: "demo-lobby",
  currentStepId: "s1",
  stepsSeen: ["s1"],
  triggerReason: "userMessage",
  isAutoTour: false,
};

function makeRequest(body: unknown, ip = "1.2.3.4") {
  return new Request("http://localhost/api/tour/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

function mockStreamResult() {
  return {
    toUIMessageStreamResponse: () =>
      new Response("data: {}\n\n", {
        status: 200,
        headers: {
          "x-vercel-ai-ui-message-stream": "v1",
          "content-type": "text/event-stream",
        },
      }),
  };
}

beforeEach(() => {
  streamTextMock.mockReset();
  queryRoomPricesMock.mockClear();
  streamTextMock.mockReturnValue(mockStreamResult());
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("DATABASE_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/tour/chat", () => {
  it("geçersiz gövdede 400 ve Türkçe hata döner", async () => {
    const res = await POST(makeRequest({ hotelSlug: "aurelia-bay" }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: "Geçersiz istek",
    });
  });

  it("bilinmeyen turda 404 döner", async () => {
    const res = await POST(
      makeRequest({ ...baseBody, hotelSlug: "olmayan-otel", tourId: "yok" }),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: "Tur bulunamadı.",
    });
  });

  it("OPENAI_API_KEY yokken 503 döner", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const res = await POST(makeRequest(baseBody));
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: "Yapay zeka servisi yapılandırılmamış.",
    });
  });

  it("geçerli istekte UI message stream döner ve bağlam sunucudan kurulur", async () => {
    const res = await POST(makeRequest(baseBody));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
    expect(streamTextMock).toHaveBeenCalledTimes(1);

    const call = streamTextMock.mock.calls[0][0] as {
      system: string;
      tools: Record<string, { execute?: (input: unknown) => Promise<unknown> }>;
      experimental_transform?: unknown;
    };
    expect(call.system).toContain("Yapay Zeka Rehberi");
    expect(call.system).toContain("s1");
    expect(call.system).toContain("Tur ilerlemesi");
    expect(call.experimental_transform).toBeDefined();
    expect(Object.keys(call.tools)).toEqual(
      expect.arrayContaining([
        "navigateTo",
        "suggestNext",
        "openInquiry",
        "autoTourNext",
        "endAutoTour",
        "getRoomPrice",
        "citeFact",
      ]),
    );
  });

  it("fiyat sorusunda system prompt tool ipucu içerir", async () => {
    await POST(
      makeRequest({
        ...baseBody,
        messages: [{ role: "user", content: "Gecelik fiyat ne kadar?" }],
      }),
    );
    const call = streamTextMock.mock.calls[0][0] as { system: string };
    expect(call.system).toContain("getRoomPrice");
  });

  it("getRoomPrice execute fiyat motorunu çağırır", async () => {
    await POST(
      makeRequest({
        ...baseBody,
        messages: [{ role: "user", content: "Gecelik fiyat ne kadar?" }],
      }),
    );
    const call = streamTextMock.mock.calls[0][0] as {
      tools: { getRoomPrice: { execute: (input: unknown) => Promise<unknown> } };
    };
    await call.tools.getRoomPrice.execute({ roomSlug: "deluxe" });
    expect(queryRoomPricesMock).toHaveBeenCalledWith("aurelia-bay", { roomSlug: "deluxe" });
  });

  it("hız sınırı aşıldığında 429 ve Türkçe mesaj döner", async () => {
    const ip = "9.9.9.9";
    let last: Response | null = null;
    for (let i = 0; i < 31; i++) {
      last = await POST(makeRequest(baseBody, ip));
    }
    expect(last!.status).toBe(429);
    await expect(last!.json()).resolves.toMatchObject({
      error: "Çok fazla istek gönderdiniz, lütfen biraz bekleyin.",
    });
  });
});

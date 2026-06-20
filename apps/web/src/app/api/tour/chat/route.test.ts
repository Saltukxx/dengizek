// ---------------------------------------------------------------------------
// AI tur sohbeti route testleri — akış (streamText) sürümü
// streamText mock'lanır; OpenAI'ye gerçek istek atılmaz.
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

beforeEach(() => {
  streamTextMock.mockReset();
  streamTextMock.mockReturnValue({
    toTextStreamResponse: () => new Response("akış", { status: 200 }),
  });
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  // Testler DB'siz çalışır — manifest demo mock'tan gelir
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
    await expect(res.json()).resolves.toMatchObject({ message: "Tur bulunamadı." });
  });

  it("OPENAI_API_KEY yokken 503 döner", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const res = await POST(makeRequest(baseBody));
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({
      message: "Yapay zeka servisi yapılandırılmamış.",
    });
  });

  it("geçerli istekte akış yanıtı döner ve bağlam sunucudan kurulur", async () => {
    const res = await POST(makeRequest(baseBody));
    expect(res.status).toBe(200);
    expect(streamTextMock).toHaveBeenCalledTimes(1);

    const call = streamTextMock.mock.calls[0][0] as {
      system: string;
      tools: Record<string, unknown>;
    };
    // Sunucu-taraflı bağlam: otel verisi system prompt'a gömülür,
    // istemciden gelen hiçbir bağlam kullanılmaz
    expect(call.system).toContain("Yapay Zeka Rehberi");
    expect(call.system).toContain("s1");
    expect(Object.keys(call.tools)).toEqual(
      expect.arrayContaining([
        "navigateTo",
        "suggestNext",
        "openInquiry",
        "autoTourNext",
        "endAutoTour",
      ]),
    );
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

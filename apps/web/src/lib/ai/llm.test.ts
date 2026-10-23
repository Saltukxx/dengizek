import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APICallError } from "ai";

const primaryGenerate = vi.fn();
const fallbackGenerate = vi.fn();

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => ({
    languageModel: (id: string) => ({
      specificationVersion: "v3",
      provider: "google",
      modelId: id,
      supportedUrls: {},
      doGenerate: id === "primary-model" ? primaryGenerate : fallbackGenerate,
      doStream: vi.fn(),
    }),
  }),
}));

import { fallbackModelId, getChatModel, shouldFallBack } from "@/lib/ai/llm";

function apiError(statusCode: number) {
  return new APICallError({ message: `HTTP ${statusCode}`, url: "x", requestBodyValues: {}, statusCode });
}

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("AI_CHAT_MODEL", "primary-model");
  vi.stubEnv("AI_FALLBACK_MODEL", "fallback-model");
  primaryGenerate.mockReset();
  fallbackGenerate.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe("yedek model", () => {
  it("kota, sunucu ve kaldırılmış model hatalarında yedeğe geçer", () => {
    expect(shouldFallBack(apiError(429))).toBe(true);
    expect(shouldFallBack(apiError(503))).toBe(true);
    expect(shouldFallBack(apiError(404))).toBe(true);
    expect(shouldFallBack(apiError(400))).toBe(false);
    expect(shouldFallBack(new Error("timeout"))).toBe(false);
  });

  it("ana model 429 verince isteği yedek modelle tekrarlar", async () => {
    primaryGenerate.mockRejectedValue(apiError(429));
    fallbackGenerate.mockResolvedValue({ content: [], finishReason: "stop", usage: {}, warnings: [] });
    const model = getChatModel() as unknown as { doGenerate: (p: unknown) => Promise<unknown> };
    await model.doGenerate({ prompt: [] });
    expect(fallbackGenerate).toHaveBeenCalledTimes(1);
  });

  it("geçersiz istek hatasında yedeğe geçmez", async () => {
    primaryGenerate.mockRejectedValue(apiError(400));
    const model = getChatModel() as unknown as { doGenerate: (p: unknown) => Promise<unknown> };
    await expect(model.doGenerate({ prompt: [] })).rejects.toThrow("HTTP 400");
    expect(fallbackGenerate).not.toHaveBeenCalled();
  });

  it("none ile ya da ana modelle aynıysa yedek kapalıdır", () => {
    vi.stubEnv("AI_FALLBACK_MODEL", "none");
    expect(fallbackModelId()).toBeNull();
    vi.stubEnv("AI_FALLBACK_MODEL", "primary-model");
    expect(fallbackModelId()).toBeNull();
  });
});

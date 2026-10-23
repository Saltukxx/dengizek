import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const embedMock = vi.fn();
vi.mock("ai", () => ({
  embed: (...args: unknown[]) => embedMock(...args),
  cosineSimilarity: (a: number[], b: number[]) =>
    a.reduce((sum, v, i) => sum + v * b[i]!, 0) /
    (Math.sqrt(a.reduce((s, v) => s + v * v, 0)) * Math.sqrt(b.reduce((s, v) => s + v * v, 0))),
}));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => ({
    embeddingModel: (id: string) => ({ modelId: id }),
  }),
}));

const vec = (n: number) => Array.from({ length: n }, (_, i) => (i + 1) / n);

import { embedText, cosineSimilarity } from "@/lib/ai/embeddings";

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  embedMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("embedText", () => {
  it("GEMINI_API_KEY yoksa null döner, API'yi çağırmaz", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const result = await embedText("merhaba");
    expect(result).toBeNull();
    expect(embedMock).not.toHaveBeenCalled();
  });

  it("boş metin için null döner", async () => {
    const result = await embedText("   ");
    expect(result).toBeNull();
    expect(embedMock).not.toHaveBeenCalled();
  });

  it("embed sonucunu döner", async () => {
    embedMock.mockResolvedValue({ embedding: vec(1536) });
    const result = await embedText("check-in saati kaçta?");
    expect(result).toEqual(vec(1536));
  });

  it("şema boyutuyla uyuşmayan vektörü reddeder (yanlış model seçimi)", async () => {
    embedMock.mockResolvedValue({ embedding: vec(768) });
    const result = await embedText("merhaba");
    expect(result).toBeNull();
  });

  it("API hatasında null döner (RAG hatası sohbeti kırmamalı)", async () => {
    embedMock.mockRejectedValue(new Error("rate limit"));
    const result = await embedText("merhaba");
    expect(result).toBeNull();
  });
});

describe("cosineSimilarity re-export", () => {
  it("ai paketinden re-export edilmiş fonksiyonu kullanılabilir", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1, 5);
  });
});

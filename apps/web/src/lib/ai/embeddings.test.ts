import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const embedMock = vi.fn();
vi.mock("ai", () => ({
  embed: (...args: unknown[]) => embedMock(...args),
  cosineSimilarity: (a: number[], b: number[]) =>
    a.reduce((sum, v, i) => sum + v * b[i]!, 0) /
    (Math.sqrt(a.reduce((s, v) => s + v * v, 0)) * Math.sqrt(b.reduce((s, v) => s + v * v, 0))),
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: () => ({
    embedding: (id: string) => ({ modelId: id }),
  }),
}));

import { embedText, cosineSimilarity } from "@/lib/ai/embeddings";

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  embedMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("embedText", () => {
  it("OPENAI_API_KEY yoksa null döner, API çağırmaz", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
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
    embedMock.mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });
    const result = await embedText("check-in saati kaçta?");
    expect(result).toEqual([0.1, 0.2, 0.3]);
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

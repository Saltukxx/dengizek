import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiFactCatalogEntry } from "@/lib/ai/types";

const embedTextMock = vi.fn();
vi.mock("@/lib/ai/embeddings", () => ({
  embedText: (...args: unknown[]) => embedTextMock(...args),
}));

const dbRowsMock = vi.fn();
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => dbRowsMock(),
          }),
        }),
      }),
    }),
  }),
}));

import { filterRelevantFacts, filterRelevantFactsLexical } from "@/lib/ai/context-router";

const catalog: AiFactCatalogEntry[] = Array.from({ length: 20 }, (_, i) => ({
  id: `fact.${i}`,
  kind: i % 2 === 0 ? "verified" : "policy",
  hint: i === 5 ? "evcil hayvan pets" : `genel bilgi ${i}`,
  text: `Metin ${i}`,
}));

beforeEach(() => {
  embedTextMock.mockReset();
  dbRowsMock.mockReset();
});

describe("filterRelevantFactsLexical", () => {
  it("küçük katalogda tümünü döner", () => {
    const small = catalog.slice(0, 10);
    expect(filterRelevantFactsLexical(small, { userMessage: "evcil" })).toHaveLength(10);
  });

  it("büyük katalogda ilgili alt küme filtreler", () => {
    const filtered = filterRelevantFactsLexical(catalog, { userMessage: "evcil hayvan" });
    expect(filtered.length).toBeLessThanOrEqual(15);
    expect(filtered.some((e) => e.hint.includes("evcil"))).toBe(true);
  });
});

describe("filterRelevantFacts", () => {
  it("küçük katalogda embedding'e hiç başvurmadan tümünü döner", async () => {
    const small = catalog.slice(0, 10);
    const result = await filterRelevantFacts(small, "test-hotel", { userMessage: "evcil" });
    expect(result).toHaveLength(10);
    expect(embedTextMock).not.toHaveBeenCalled();
  });

  it("embedding mevcutsa DB'den dönen top-K factId sırasına göre eşler", async () => {
    embedTextMock.mockResolvedValue([0.1, 0.2, 0.3]);
    dbRowsMock.mockResolvedValue([{ factId: "fact.5" }, { factId: "fact.2" }]);

    const result = await filterRelevantFacts(catalog, "test-hotel", { userMessage: "evcil hayvan" });
    expect(result.map((e) => e.id)).toEqual(["fact.5", "fact.2"]);
  });

  it("önceden hesaplanmış embedding verilirse tekrar embed etmez", async () => {
    dbRowsMock.mockResolvedValue([{ factId: "fact.0" }]);
    const result = await filterRelevantFacts(catalog, "test-hotel", {
      userMessage: "evcil hayvan",
      userMessageEmbedding: [0.9, 0.8],
    });
    expect(embedTextMock).not.toHaveBeenCalled();
    expect(result.map((e) => e.id)).toEqual(["fact.0"]);
  });

  it("embedText null dönerse (API key yok) lexical'e düşer", async () => {
    embedTextMock.mockResolvedValue(null);
    const result = await filterRelevantFacts(catalog, "test-hotel", { userMessage: "evcil hayvan" });
    expect(dbRowsMock).not.toHaveBeenCalled();
    expect(result.some((e) => e.hint.includes("evcil"))).toBe(true);
  });

  it("DB sorgusu boş dönerse (henüz sync edilmemiş) lexical'e düşer", async () => {
    embedTextMock.mockResolvedValue([0.1, 0.2, 0.3]);
    dbRowsMock.mockResolvedValue([]);
    const result = await filterRelevantFacts(catalog, "test-hotel", { userMessage: "evcil hayvan" });
    expect(result.some((e) => e.hint.includes("evcil"))).toBe(true);
  });

  it("DB hatasında sohbeti kırmadan lexical'e düşer", async () => {
    embedTextMock.mockResolvedValue([0.1, 0.2, 0.3]);
    dbRowsMock.mockRejectedValue(new Error("db down"));
    const result = await filterRelevantFacts(catalog, "test-hotel", { userMessage: "evcil hayvan" });
    expect(result.some((e) => e.hint.includes("evcil"))).toBe(true);
  });

  it("DB'den dönen factId kataloqda yoksa (stale) lexical'e düşer", async () => {
    embedTextMock.mockResolvedValue([0.1, 0.2, 0.3]);
    dbRowsMock.mockResolvedValue([{ factId: "fact.olmayan" }]);
    const result = await filterRelevantFacts(catalog, "test-hotel", { userMessage: "evcil hayvan" });
    expect(result.some((e) => e.hint.includes("evcil"))).toBe(true);
  });
});

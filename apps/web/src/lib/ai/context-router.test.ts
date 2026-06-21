import { describe, expect, it } from "vitest";
import { filterRelevantFacts } from "@/lib/ai/context-router";
import type { AiFactCatalogEntry } from "@/lib/ai/types";

const catalog: AiFactCatalogEntry[] = Array.from({ length: 20 }, (_, i) => ({
  id: `fact.${i}`,
  kind: i % 2 === 0 ? "verified" : "policy",
  hint: i === 5 ? "evcil hayvan pets" : `genel bilgi ${i}`,
  text: `Metin ${i}`,
}));

describe("filterRelevantFacts", () => {
  it("küçük katalogda tümünü döner", () => {
    const small = catalog.slice(0, 10);
    expect(filterRelevantFacts(small, { userMessage: "evcil" })).toHaveLength(10);
  });

  it("büyük katalogda ilgili alt küme filtreler", () => {
    const filtered = filterRelevantFacts(catalog, { userMessage: "evcil hayvan" });
    expect(filtered.length).toBeLessThanOrEqual(15);
    expect(filtered.some((e) => e.hint.includes("evcil"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fact katalog filtreleme — token/latency optimizasyonu
// ---------------------------------------------------------------------------

import type { AiFactCatalogEntry } from "@/lib/ai/types";

const MAX_FACTS_IN_PROMPT = 15;

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

/** Kullanıcı mesajı + adım bağlamına göre ilgili fact alt kümesi. */
export function filterRelevantFacts(
  catalog: AiFactCatalogEntry[],
  opts: {
    userMessage?: string;
    currentStepTags?: string[];
  },
): AiFactCatalogEntry[] {
  if (catalog.length <= MAX_FACTS_IN_PROMPT) return catalog;

  const query = normalize(
    [opts.userMessage ?? "", ...(opts.currentStepTags ?? [])].join(" "),
  );
  if (!query.trim()) return catalog.slice(0, MAX_FACTS_IN_PROMPT);

  const scored = catalog.map((entry) => {
    const hay = normalize(`${entry.id} ${entry.hint} ${entry.text}`);
    let score = 0;
    for (const token of query.split(/\s+/)) {
      if (token.length < 3) continue;
      if (hay.includes(token)) score += 2;
    }
    if (entry.kind === "policy") score += 0.5;
    if (entry.kind === "otel_ifadesi") score += 0.25;
    return { entry, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter((s) => s.score > 0).slice(0, MAX_FACTS_IN_PROMPT);
  if (top.length === 0) return catalog.slice(0, MAX_FACTS_IN_PROMPT);
  return top.map((s) => s.entry);
}

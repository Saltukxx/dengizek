// ---------------------------------------------------------------------------
// Fact katalog filtreleme — token/latency optimizasyonu.
// Embedding tabanlı retrieval (bkz. plan Faz 3.1), lexical fallback ile.
// ---------------------------------------------------------------------------

import { embedText } from "@/lib/ai/embeddings";
import type { AiFactCatalogEntry } from "@/lib/ai/types";

const MAX_FACTS_IN_PROMPT = 15;

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

/** Lexical (kelime-örtüşmesi) skorlama — embedding kullanılamadığında fallback. */
export function filterRelevantFactsLexical(
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

/**
 * Embedding tabanlı top-K retrieval — hotel_fact_embeddings tablosundan
 * cosine-distance ile en yakın factId'leri çeker, sonra tam katalog
 * entry'lerine eşler. Herhangi bir adımda (embed API, DB, henüz sync
 * edilmemiş katalog) sorun çıkarsa null döner — çağıran taraf lexical'e
 * düşer, RAG hatası sohbeti asla kırmaz.
 */
async function tryEmbeddingRetrieval(
  catalog: AiFactCatalogEntry[],
  hotelSlug: string,
  userMessage: string,
  precomputedEmbedding: number[] | null | undefined,
): Promise<AiFactCatalogEntry[] | null> {
  try {
    const queryEmbedding = precomputedEmbedding ?? (await embedText(userMessage));
    if (!queryEmbedding) return null;

    const { getDb } = await import("@/lib/db");
    const { hotelFactEmbeddingsTable } = await import("@/lib/db/schema");
    const { eq, sql } = await import("drizzle-orm");
    const db = getDb();

    const vectorLiteral = `[${queryEmbedding.join(",")}]`;
    const rows = await db
      .select({ factId: hotelFactEmbeddingsTable.factId })
      .from(hotelFactEmbeddingsTable)
      .where(eq(hotelFactEmbeddingsTable.hotelSlug, hotelSlug))
      .orderBy(sql`${hotelFactEmbeddingsTable.embedding} <=> ${vectorLiteral}::vector`)
      .limit(MAX_FACTS_IN_PROMPT);

    if (rows.length === 0) return null; // henüz syncFactEmbeddings çalışmamış

    const byId = new Map(catalog.map((e) => [e.id, e]));
    const matched = rows
      .map((r) => byId.get(r.factId))
      .filter((e): e is AiFactCatalogEntry => Boolean(e));
    return matched.length > 0 ? matched : null;
  } catch (err) {
    console.warn("[context-router] embedding retrieval başarısız, lexical'e düşülüyor:", err);
    return null;
  }
}

/**
 * Kullanıcı mesajı + adım bağlamına göre ilgili fact alt kümesi. Küçük
 * kataloglarda (≤15) kısa-devre yapılır (embedding çağrısına gerek yok).
 * Büyük kataloglarda önce embedding tabanlı retrieval denenir, başarısız
 * olursa lexical skorlamaya düşülür.
 */
export async function filterRelevantFacts(
  catalog: AiFactCatalogEntry[],
  hotelSlug: string,
  opts: {
    userMessage?: string;
    currentStepTags?: string[];
    /** Bu turda zaten hesaplanmışsa (ör. inquiry-intent kontrolüyle paylaşılan) yeniden embed etmeyi atlar. */
    userMessageEmbedding?: number[] | null;
  },
): Promise<AiFactCatalogEntry[]> {
  if (catalog.length <= MAX_FACTS_IN_PROMPT) return catalog;

  if (opts.userMessage?.trim()) {
    const viaEmbedding = await tryEmbeddingRetrieval(
      catalog,
      hotelSlug,
      opts.userMessage,
      opts.userMessageEmbedding,
    );
    if (viaEmbedding) return viaEmbedding;
  }

  return filterRelevantFactsLexical(catalog, opts);
}

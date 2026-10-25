// ---------------------------------------------------------------------------
// Arama asistanı kayıtları — sözlüğü tahminle değil gerçek aramalarla
// genişletmek için. Yönetici panelinde: sonuçsuz aramalar, anlaşılmayan
// kelimeler, en çok aranan istekler.
//
// Gizlilik: yalnız sorgu metni (iletişim bilgisi maskelenir, en fazla 200
// karakter) ve sonuç sayıları saklanır; IP, oturum ya da kimlik yazılmaz.
// Olay yalnız sunucudan yazılır (misafir tarafı bu türü gönderemez).
// ---------------------------------------------------------------------------

import { redactContactInfo } from "@/lib/contact-guard";
import type { SearchResponse } from "@/lib/ai/hotel-search";
import { groupingKey } from "@/lib/ai/text";

export const SEARCH_EVENT = "hotel_search";
const MAX_QUERY_CHARS = 200;

export interface SearchLogPayload {
  query: string;
  results: number;
  partial: number;
  unknown: string[];
  corrections: number;
  followUp: boolean;
  /** Kurallar yetmedi, model yorumu kullanıldı. */
  model: boolean;
}

export function searchLogPayload(query: string, response: SearchResponse & { interpretedByModel?: boolean }): SearchLogPayload {
  return {
    query: redactContactInfo(query.replace(/\s+/g, " ").trim()).slice(0, MAX_QUERY_CHARS),
    results: response.results.length,
    partial: response.partial.length,
    unknown: response.query.unknown.slice(0, 10),
    corrections: response.query.corrections.length,
    followUp: response.chain.length > 1,
    model: Boolean(response.interpretedByModel),
  };
}

export interface SearchQueryGroup {
  query: string;
  count: number;
  /** Son aramadaki tam sonuç sayısı. */
  results: number;
  lastAt: string;
}

export interface SearchInsights {
  total: number;
  /** Tam sonuç vermeyen aramalar (en çok tekrarlanan önce). */
  noResults: SearchQueryGroup[];
  /** Anlaşılmayan kelimeler — sözlüğe eklenecek adaylar. */
  unknownWords: Array<{ word: string; count: number }>;
  /** En çok aranan istekler. */
  top: SearchQueryGroup[];
}

export function summarizeSearches(
  events: Array<{ payload: Record<string, unknown> | null; createdAt: Date }>,
  limit = 20,
): SearchInsights {
  const groups = new Map<string, SearchQueryGroup>();
  const unknown = new Map<string, number>();
  let total = 0;
  for (const event of events) {
    const p = event.payload ?? {};
    if (typeof p.query !== "string" || !p.query) continue;
    total += 1;
    const key = groupingKey(p.query);
    const at = event.createdAt.toISOString();
    const results = typeof p.results === "number" ? p.results : 0;
    const group = groups.get(key);
    if (!group) groups.set(key, { query: p.query, count: 1, results, lastAt: at });
    else {
      group.count += 1;
      if (at > group.lastAt) Object.assign(group, { lastAt: at, results, query: p.query });
    }
    for (const word of Array.isArray(p.unknown) ? p.unknown : []) {
      if (typeof word === "string") unknown.set(word, (unknown.get(word) ?? 0) + 1);
    }
  }
  const byCount = (a: SearchQueryGroup, b: SearchQueryGroup) => b.count - a.count || b.lastAt.localeCompare(a.lastAt);
  const all = [...groups.values()];
  return {
    total,
    noResults: all.filter((g) => g.results === 0).sort(byCount).slice(0, limit),
    unknownWords: [...unknown.entries()].map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count).slice(0, limit),
    top: all.sort(byCount).slice(0, limit),
  };
}

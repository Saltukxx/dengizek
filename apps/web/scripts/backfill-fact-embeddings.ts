// ---------------------------------------------------------------------------
// Fact embedding backfill — yayında olup embedding'i eksik/bayat kalan
// oteller için syncFactEmbeddings çalıştırır. syncFactEmbeddings hash-diff
// yaptığı için idempotenttir: değişmeyen fact'ler yeniden embed edilmez.
// Kullanım: dotenv -e .env.local -- tsx scripts/backfill-fact-embeddings.ts
// ---------------------------------------------------------------------------

import { and, count, eq, isNotNull, isNull } from "drizzle-orm";
import { clearFactCatalogCache, syncFactEmbeddings } from "../src/lib/ai/fact-store";
import { isLlmConfigured } from "../src/lib/ai/llm";
import { getDb } from "../src/lib/db";
import { hotelFactEmbeddingsTable, hotelsTable } from "../src/lib/db/schema";

async function main() {
  if (!process.env.DATABASE_URL || !isLlmConfigured()) {
    console.error("DATABASE_URL ve GEMINI_API_KEY gerekli.");
    process.exitCode = 1;
    return;
  }

  const db = getDb();
  const hotels = await db
    .select({ id: hotelsTable.id, slug: hotelsTable.slug })
    .from(hotelsTable)
    .where(
      and(
        eq(hotelsTable.status, "yayinda"),
        isNull(hotelsTable.suspendedAt),
        isNotNull(hotelsTable.publishedSnapshot),
      ),
    );

  const failed: Array<{ slug: string; error: string }> = [];
  const results: Array<{ slug: string; embeddings: number }> = [];

  for (const hotel of hotels) {
    try {
      // Cache'i temizle ki katalog güncel publishedSnapshot'tan üretilsin.
      clearFactCatalogCache(hotel.slug);
      await syncFactEmbeddings(hotel.slug);
      const [row] = await db
        .select({ n: count() })
        .from(hotelFactEmbeddingsTable)
        .where(eq(hotelFactEmbeddingsTable.hotelSlug, hotel.slug));
      results.push({ slug: hotel.slug, embeddings: row?.n ?? 0 });
    } catch (error) {
      failed.push({ slug: hotel.slug, error: error instanceof Error ? error.message : String(error) });
    }
  }

  console.log(JSON.stringify({ scanned: hotels.length, results, failed }, null, 2));
  if (failed.length) process.exitCode = 1;
}

void main();

import { eq, isNull } from "drizzle-orm";
import { clearFactCatalogCache, syncFactEmbeddings } from "../src/lib/ai/fact-store";
import { getDb } from "../src/lib/db";
import { hotelsTable } from "../src/lib/db/schema";
import { buildHotelContentSnapshot } from "../src/lib/hotel-content-snapshot";
import { hotelContentSnapshotSchema } from "../src/lib/schemas/hotel-content-snapshot";

async function main() {
  const db = getDb();
  const hotels = await db.select({ id: hotelsTable.id, slug: hotelsTable.slug, draftRevision: hotelsTable.draftRevision })
    .from(hotelsTable)
    .where(isNull(hotelsTable.publishedSnapshot));
  const failed: Array<{ id: string; slug: string; error: string }> = [];
  let updated = 0;
  for (const hotel of hotels) {
    try {
      const snapshot = hotelContentSnapshotSchema.parse(await buildHotelContentSnapshot(db, hotel.id));
      await db.update(hotelsTable).set({
        publishedSnapshot: snapshot,
        publishedRevision: hotel.draftRevision,
      }).where(eq(hotelsTable.id, hotel.id));
      // publishedSnapshot admin onayı dışında yazıldı — admin onay rotasındaki
      // cache temizliği ve embedding senkronu burada da yapılmalı, yoksa RAG
      // bu oteller için kalıcı olarak lexical fallback'te kalır.
      clearFactCatalogCache(hotel.slug);
      await syncFactEmbeddings(hotel.slug);
      updated += 1;
    } catch (error) {
      failed.push({ id: hotel.id, slug: hotel.slug, error: error instanceof Error ? error.message : String(error) });
    }
  }
  console.log(JSON.stringify({ scanned: hotels.length, updated, failed }, null, 2));
  if (failed.length) process.exitCode = 1;
}

void main();

// ---------------------------------------------------------------------------
// Aktarılan (taslak) otelleri YEREL veritabanında AI eval'ı için geçici olarak
// yayına alır / geri çeker.
//
//   npm run eval:imported -- publish <oteller.json>   # yayına al + embedding
//   npm run eval:imported -- revert  <oteller.json>   # tekrar taslak
//
// Rehber yalnız yayındaki snapshot'ı okur; eval bu yüzden otellerin yayında
// olmasını ister. Canlı veritabanında çalışmaz (yalnız localhost).
// ---------------------------------------------------------------------------

import { readFile } from "node:fs/promises";
import { inArray } from "drizzle-orm";
import { clearFactCatalogCache, syncFactEmbeddings } from "../src/lib/ai/fact-store";
import { getDb } from "../src/lib/db";
import { hotelsTable } from "../src/lib/db/schema";
import { buildHotelContentSnapshot } from "../src/lib/hotel-content-snapshot";
import { hotelContentSnapshotSchema } from "../src/lib/schemas/hotel-content-snapshot";
import { eq } from "drizzle-orm";

async function main() {
  const [mode, file] = process.argv.slice(2);
  if ((mode !== "publish" && mode !== "revert") || !file) {
    throw new Error("Kullanım: eval-imported-hotels <publish|revert> <oteller.json>");
  }
  const host = new URL((process.env.DATABASE_URL ?? "").replace(/^postgres(ql)?:/, "http:")).hostname;
  if (!["localhost", "127.0.0.1"].includes(host)) throw new Error(`Yalnız yerel veritabanında çalışır (host: ${host}).`);

  const slugs = (JSON.parse(await readFile(file, "utf-8")) as Array<{ slug: string }>).map((h) => h.slug);
  const db = getDb();
  const hotels = await db
    .select({ id: hotelsTable.id, slug: hotelsTable.slug, status: hotelsTable.status, draftRevision: hotelsTable.draftRevision })
    .from(hotelsTable)
    .where(inArray(hotelsTable.slug, slugs));

  if (mode === "revert") {
    await db
      .update(hotelsTable)
      .set({ status: "taslak", publishedSnapshot: null, publishedRevision: null })
      .where(inArray(hotelsTable.slug, slugs));
    console.log(`${hotels.length} otel taslağa çekildi.`);
    process.exit(0);
  }

  let ok = 0;
  for (const hotel of hotels) {
    try {
      const snapshot = hotelContentSnapshotSchema.parse(await buildHotelContentSnapshot(db, hotel.id));
      await db
        .update(hotelsTable)
        .set({ status: "yayinda", publishedSnapshot: snapshot, publishedRevision: hotel.draftRevision })
        .where(eq(hotelsTable.id, hotel.id));
      clearFactCatalogCache(hotel.slug);
      await syncFactEmbeddings(hotel.slug);
      ok += 1;
      console.log(`✓ ${hotel.slug}`);
    } catch (error) {
      console.error(`✗ ${hotel.slug}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`${ok}/${hotels.length} otel yayında (yerel).`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

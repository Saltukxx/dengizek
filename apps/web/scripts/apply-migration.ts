// ---------------------------------------------------------------------------
// Tek seferlik migrasyon uygulayıcı — drizzle-kit push websocket gerektirdiği
// için HTTP sürücüsüyle SQL dosyasını statement-breakpoint'lerden bölerek
// sırayla çalıştırır.
// Kullanım: npx dotenv -e .env.local -- tsx scripts/apply-migration.ts drizzle/0001_clean_silver_centurion.sql
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Kullanım: tsx scripts/apply-migration.ts <sql-dosyası>");
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL tanımlı değil.");
    process.exit(1);
  }

  const sqlClient = neon(url);
  const raw = readFileSync(file, "utf8");
  const statements = raw
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  console.log(`${statements.length} ifade çalıştırılacak (${file})`);
  for (const [i, stmt] of statements.entries()) {
    const head = stmt.split("\n")[0].slice(0, 80);
    try {
      // neon() v0.10 etiketli şablon bekler — dinamik SQL için şablon taklidi
      const tpl = Object.assign([stmt], { raw: [stmt] }) as unknown as TemplateStringsArray;
      await sqlClient(tpl);
      console.log(`  ✓ [${i + 1}/${statements.length}] ${head}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Tekrar çalıştırmada "already exists" hatalarını atla (idempotent dev akışı)
      if (/already exists/i.test(msg)) {
        console.log(`  ~ [${i + 1}/${statements.length}] atlandı (zaten var): ${head}`);
        continue;
      }
      console.error(`  ✗ [${i + 1}/${statements.length}] ${head}\n    ${msg}`);
      process.exit(1);
    }
  }
  console.log("Migrasyon tamamlandı.");
}

main();

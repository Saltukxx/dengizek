import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL tanımlı değil (.env.local).");
  process.exit(1);
}

const sql = neon(url);

try {
  const rows = await sql`SELECT version() AS version, current_database() AS db_name, 1 AS ping`;
  console.log("OK — Neon bağlantısı çalışıyor.");
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
} catch (e) {
  console.error("HATA — bağlantı başarısız:", e.message);
  process.exit(1);
}

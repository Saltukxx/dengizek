import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

/** Her Playwright koşusunu önceki koşuların login rate-limit durumundan ayırır. */
export default async function globalSetup() {
  if (!process.env.DATABASE_URL) return;
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    await sql`
      delete from rate_limit_buckets
      where (name = 'login' and bucket_key in ('yonetici@aurelia.dev', 'admin@dengizek.dev'))
         or name = 'inquiry'
    `;
  } catch (error) {
    if (process.env.CI) throw error;
    console.warn("Playwright login rate-limit temizliği atlandı; yerel DB erişilemiyor.");
  } finally {
    await sql.end();
  }
}

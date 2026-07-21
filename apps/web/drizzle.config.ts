import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });
import type { Config } from "drizzle-kit";

// drizzle-kit@0.31'de "driver" alanı yalnızca aws-data-api/d1-http/expo/
// pglite gibi özel bağlantılar için geçerli — sıradan bir Postgres/Neon
// bağlantısı (yerel veya uzak fark etmez) için dbCredentials.url yeterli.
const databaseUrl = process.env.DATABASE_URL!;

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl },
} satisfies Config;

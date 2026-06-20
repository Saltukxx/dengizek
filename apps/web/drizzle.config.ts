import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });
import type { Config } from "drizzle-kit";

function isLocalDatabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url.replace(/^postgres(ql)?:/, "http:"));
    const host = parsed.hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "postgres";
  } catch {
    return false;
  }
}

const databaseUrl = process.env.DATABASE_URL!;
const useLocalDriver = databaseUrl && isLocalDatabaseUrl(databaseUrl);

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  ...(useLocalDriver
    ? {
        driver: "pg",
        dbCredentials: { connectionString: databaseUrl },
      }
    : {
        dbCredentials: { url: databaseUrl },
      }),
} satisfies Config;

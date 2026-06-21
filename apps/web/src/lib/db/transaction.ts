// ---------------------------------------------------------------------------
// Transaction wrapper — Neon Pool ve postgres.js üzerinde db.transaction()
// ---------------------------------------------------------------------------

import { getDb, type Db, type Tx } from "@/lib/db";

export type { Tx };

export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const db = getDb();
  return db.transaction(fn);
}

/** Transaction içinde mi test etmek için (opsiyonel). */
export function supportsTransactions(db: Db): boolean {
  return typeof db.transaction === "function";
}

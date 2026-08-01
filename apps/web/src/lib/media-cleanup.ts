import { eq, lt, sql } from "drizzle-orm";
import { getDb, isDbConfigured } from "@/lib/db";
import { withTransaction } from "@/lib/db/transaction";
import { guestSessionsTable, mediaCleanupQueueTable } from "@/lib/db/schema";
import { deleteObject } from "@/lib/object-storage";

/** Anonim misafir oturumları sınırsız birikmesin — 90 günden eskiler silinir. */
const GUEST_SESSION_TTL_DAYS = 90;

export async function pruneStaleGuestSessions(): Promise<number> {
  if (!isDbConfigured()) return 0;
  const cutoff = new Date(Date.now() - GUEST_SESSION_TTL_DAYS * 86_400_000);
  const deleted = await getDb()
    .delete(guestSessionsTable)
    .where(lt(guestSessionsTable.updatedAt, cutoff))
    .returning();
  return deleted.length;
}

/**
 * Bekleyen medya nesnelerini depodan siler. Eşzamanlı cron çalışmalarında
 * aynı kaydın iki kez işlenmemesi için email_outbox ile aynı
 * FOR UPDATE SKIP LOCKED + lease deseni kullanılır: satır önce 'processing'
 * olarak kiralanır; ölen worker'ın kirası dolunca kayıt yeniden alınabilir.
 */
export async function cleanupMediaObjects(limit = 25) {
  const db = getDb();
  const leaseUntil = new Date(Date.now() + 5 * 60_000);

  const claimed = await withTransaction(async (tx) => tx.execute(sql`
    WITH candidates AS (
      SELECT id FROM media_cleanup_queue
      WHERE ((status = 'pending' AND next_attempt_at <= now())
        OR (status = 'processing' AND lease_until < now()))
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE media_cleanup_queue m
    SET status = 'processing', lease_until = ${leaseUntil}, updated_at = now()
    FROM candidates c WHERE m.id = c.id
    RETURNING m.*
  `));
  const rows = (Array.isArray(claimed)
    ? claimed
    : (claimed as unknown as { rows?: unknown[] }).rows ?? []) as Array<{
    id: string;
    object_key: string;
    attempts: number;
  }>;

  let deleted = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await deleteObject(row.object_key);
      await db
        .update(mediaCleanupQueueTable)
        .set({ status: "deleted", leaseUntil: null, updatedAt: new Date() })
        .where(eq(mediaCleanupQueueTable.id, row.id));
      deleted += 1;
    } catch (error) {
      const attempts = row.attempts + 1;
      await db
        .update(mediaCleanupQueueTable)
        .set({
          status: attempts >= 8 ? "failed" : "pending",
          attempts,
          leaseUntil: null,
          lastError: error instanceof Error ? error.message.slice(0, 2000) : "Bilinmeyen hata",
          nextAttemptAt: new Date(Date.now() + Math.min(3_600_000, 30_000 * 2 ** attempts)),
          updatedAt: new Date(),
        })
        .where(eq(mediaCleanupQueueTable.id, row.id));
      failed += 1;
    }
  }
  return { deleted, failed };
}

import { and, eq, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { mediaCleanupQueueTable } from "@/lib/db/schema";
import { deleteObject } from "@/lib/object-storage";

export async function cleanupMediaObjects(limit = 25) {
  const db = getDb();
  const rows = await db.select().from(mediaCleanupQueueTable)
    .where(and(eq(mediaCleanupQueueTable.status, "pending"), lte(mediaCleanupQueueTable.nextAttemptAt, new Date())))
    .limit(limit);
  let deleted = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await deleteObject(row.objectKey);
      await db.update(mediaCleanupQueueTable).set({ status: "deleted", updatedAt: new Date() }).where(eq(mediaCleanupQueueTable.id, row.id));
      deleted += 1;
    } catch (error) {
      const attempts = row.attempts + 1;
      await db.update(mediaCleanupQueueTable).set({
        status: attempts >= 8 ? "failed" : "pending",
        attempts,
        lastError: error instanceof Error ? error.message.slice(0, 2000) : "Bilinmeyen hata",
        nextAttemptAt: new Date(Date.now() + Math.min(3_600_000, 30_000 * 2 ** attempts)),
        updatedAt: new Date(),
      }).where(eq(mediaCleanupQueueTable.id, row.id));
      failed += 1;
    }
  }
  return { deleted, failed };
}

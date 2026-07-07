import { and, eq, sql } from "drizzle-orm";
import { getDb, isDbConfigured } from "@/lib/db";
import { emailOutboxTable } from "@/lib/db/schema";
import { withTransaction } from "@/lib/db/transaction";

export interface EmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

async function deliver(input: EmailInput) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    if (process.env.NODE_ENV === "production") throw new Error("EMAIL_NOT_CONFIGURED");
    console.info("[email:mock]", input.to, input.subject);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html ?? input.text.replace(/\n/g, "<br>"),
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

/** E-postayı kalıcı kuyruğa alır. DB'siz geliştirmede doğrudan teslim eder. */
export async function sendEmail(input: EmailInput) {
  if (!isDbConfigured()) {
    try { await deliver(input); return true; } catch (err) { console.error("[email]", err); return false; }
  }
  await getDb().insert(emailOutboxTable).values({
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html ?? null,
  });
  return true;
}

/** Cron/worker giriş noktası: pending kayıtları retry/backoff ile teslim eder. */
export async function deliverPendingEmails(limit = 25) {
  if (!isDbConfigured()) return { sent: 0, failed: 0 };
  const db = getDb();
  const workerId = crypto.randomUUID();
  const leaseUntil = new Date(Date.now() + 5 * 60_000);
  const claimed = await withTransaction(async (tx) => tx.execute(sql`
    WITH candidates AS (
      SELECT id FROM email_outbox
      WHERE ((status = 'pending' AND next_attempt_at <= now())
        OR (status = 'processing' AND lease_until < now()))
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE email_outbox e
    SET status = 'processing', processing_at = now(), lease_until = ${leaseUntil}, worker_id = ${workerId}, updated_at = now()
    FROM candidates c WHERE e.id = c.id
    RETURNING e.*
  `));
  const rows = (Array.isArray(claimed) ? claimed : (claimed as unknown as { rows?: unknown[] }).rows ?? []) as Array<typeof emailOutboxTable.$inferSelect>;
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await deliver({ to: row.to, subject: row.subject, text: row.text, html: row.html ?? undefined });
      await db.update(emailOutboxTable).set({ status: "sent", sentAt: new Date(), leaseUntil: null, workerId: null, updatedAt: new Date() }).where(and(eq(emailOutboxTable.id, row.id), eq(emailOutboxTable.workerId, workerId)));
      sent += 1;
    } catch (err) {
      const attempts = row.attempts + 1;
      const terminal = attempts >= 8;
      await db.update(emailOutboxTable).set({
        status: terminal ? "failed" : "pending",
        attempts,
        lastError: err instanceof Error ? err.message.slice(0, 2000) : "Bilinmeyen hata",
        nextAttemptAt: new Date(Date.now() + Math.min(3_600_000, 30_000 * 2 ** attempts)),
        updatedAt: new Date(),
        leaseUntil: null,
        workerId: null,
      }).where(and(eq(emailOutboxTable.id, row.id), eq(emailOutboxTable.workerId, workerId)));
      failed += 1;
    }
  }
  return { sent, failed };
}

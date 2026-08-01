// ---------------------------------------------------------------------------
// Denetim kaydı (audit log) yardımcıları
// Tüm admin yazma işlemleri + manager "incelemeye gönder" olayları loglanır.
// Audit yazımı ana işlemi asla bloklamaz — hata yutularak konsola yazılır.
// ---------------------------------------------------------------------------

import { getDb } from "@/lib/db";
import { auditLogTable } from "@/lib/db/schema";
import type { SessionUser } from "@/lib/auth/guards";

export interface AuditEntry {
  /**
   * Oturum kullanıcısı. Oturumsuz akışlarda (misafir portalı, cron) null
   * verilir — actorId users tablosuna FK olduğu için var olmayan bir id
   * yazılamaz; bunun yerine actorLabel ile iz bırakılır.
   */
  actor: SessionUser | null;
  /** actor null iken kaydedilecek serbest etiket, ör. "misafir-portali". */
  actorLabel?: string;
  /** Nokta-ayrımlı ASCII anahtar: "otel.onaylandi", "tur.reddedildi", "kullanici.olusturuldu" */
  action: string;
  entityType: "hotel" | "tour" | "user" | "media" | "inquiry";
  entityId: string;
  meta?: Record<string, unknown>;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const db = getDb();
    await db.insert(auditLogTable).values({
      actorId: entry.actor?.id ?? null,
      actorEmail: entry.actor?.email ?? entry.actorLabel ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      meta: entry.meta ?? null,
    });
  } catch (err) {
    // Denetim kaydı başarısızlığı ana işlemi engellemez
    console.error("[audit] kayıt yazılamadı:", err);
  }
}

// ---------------------------------------------------------------------------
// Yapay zekâ konuşma metinlerinin saklama süresi.
//
// Misafirin yazdığı metin (soru, arama sorgusu) ve rehberin cevabı 90 gün
// tutulur; sonra olaydan silinir. Konu, sonuç, süre, araç ve token gibi
// sayısal/sınıf alanları kalır — toplam istatistikler süresiz çalışır.
// Saatlik bakım cron'u çağırır (bkz. /api/internal/media-cleanup).
// ---------------------------------------------------------------------------

import { sql } from "drizzle-orm";
import { getDb, isDbConfigured } from "@/lib/db";
import { QUESTION_EVENT } from "@/lib/ai/question-log";
import { UNANSWERED_EVENT } from "@/lib/ai/unanswered";
import { FEEDBACK_EVENT } from "@/lib/ai/feedback";
import { SEARCH_EVENT } from "@/lib/ai/search-log";

export const AI_TEXT_RETENTION_DAYS = 90;

/** Silinen metin alanları — gruplama anahtarı da sorunun normalize edilmiş metnidir. */
export const AI_TEXT_FIELDS = ["question", "answer", "key", "query", "unknown"] as const;

export const AI_TEXT_EVENT_TYPES = [QUESTION_EVENT, UNANSWERED_EVENT, FEEDBACK_EVENT, SEARCH_EVENT] as const;

/** Silinmiş kayıtta işaret — aynı satır bir daha güncellenmez. */
export const TEXT_PRUNED_FLAG = "metinSilindi";

/** Tek çalıştırmada en fazla bu kadar satır; ilk çalıştırmada birikmiş yük bölünür. */
const BATCH_SIZE = 5000;

/** Süresi dolan konuşma metinlerini siler; güncellenen satır sayısını döner. */
export async function pruneAiConversationText(now = new Date()): Promise<number> {
  if (!isDbConfigured()) return 0;
  const cutoff = new Date(now.getTime() - AI_TEXT_RETENTION_DAYS * 86_400_000);
  const stripped = AI_TEXT_FIELDS.reduce((expr, field) => sql`${expr} - ${field}`, sql`payload`);
  const types = sql.join(AI_TEXT_EVENT_TYPES.map((t) => sql`${t}`), sql`, `);
  const result = await getDb().execute(sql`
    UPDATE analytics_events
    SET payload = (${stripped}) || jsonb_build_object(${TEXT_PRUNED_FLAG}::text, true)
    WHERE id IN (
      SELECT id FROM analytics_events
      WHERE event_type IN (${types})
        AND created_at < ${cutoff.toISOString()}::timestamptz
        AND NOT (payload ? ${TEXT_PRUNED_FLAG})
      LIMIT ${BATCH_SIZE}
    )
  `);
  return (result as unknown as { count?: number; rowCount?: number }).count ??
    (result as unknown as { rowCount?: number }).rowCount ?? 0;
}

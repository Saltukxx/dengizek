// ---------------------------------------------------------------------------
// Cevapsız sorular — rehberin "bilgim yok" dediği ya da otel verisinden kart
// bulamayıp modele bıraktığı misafir soruları. Otel panelinde gruplanıp
// gösterilir: otel sahibi eksik bilgiyi bir kez girer, soru bir daha kaçmaz.
//
// Gizlilik: yalnız soru metni saklanır (iletişim bilgisi maskelenir, en fazla
// 200 karakter). IP, oturum ya da misafir kimliği yazılmaz. Olay yalnız
// sunucudan yazılır; misafir tarafı (/api/analytics/track) bu türü gönderemez.
// ---------------------------------------------------------------------------

import { redactContactInfo } from "@/lib/contact-guard";
import { groupingKey, normalizeText } from "@/lib/ai/text";

export const UNANSWERED_EVENT = "ai_unanswered";
export const UNANSWERED_MAX_CHARS = 200;

/** bilgi-yok: sunucu "doğrulanmış bilgim yok" dedi · kartsiz: bilgi kartı bulunamadı, model cevapladı. */
export type UnansweredReason = "bilgi-yok" | "kartsiz";

/** Normalize metinde (Türkçe karakter sadeleşmiş) soru işaretleri. */
const QUESTION_CUE =
  /\b(mi|mu|misiniz|musunuz|miyim|muyum|ne|neler|nedir|nasil|kac|kacta|hangi|nerede|ne zaman|what|how|which|where|when|is there|are there|do you|can i|does)\b/;

/** Selamlaşma, teşekkür gibi soru olmayan mesajlar kaydedilmez. */
export function isQuestionLike(message: string): boolean {
  const text = message.trim();
  if (text.length < 6) return false;
  return text.includes("?") || QUESTION_CUE.test(normalizeText(text));
}

export function unansweredPayload(
  message: string,
  reason: UnansweredReason,
): { question: string; reason: UnansweredReason } | null {
  if (!isQuestionLike(message)) return null;
  const question = redactContactInfo(message.replace(/\s+/g, " ").trim()).slice(0, UNANSWERED_MAX_CHARS);
  return { question, reason };
}

export interface UnansweredGroup {
  question: string;
  count: number;
  reason: UnansweredReason;
  lastAskedAt: string;
}

/**
 * Aynı soruyu (büyük/küçük harf, noktalama, Türkçe karakter farkı olmadan)
 * gruplar; en çok sorulan önce. "bilgi-yok" grubu, aynı soru bazen modele
 * kalsa bile öncelikli gösterilir (eksik bilgiyi en net o gösterir).
 */
export function groupUnanswered(
  events: Array<{ payload: Record<string, unknown> | null; createdAt: Date }>,
  limit = 20,
): UnansweredGroup[] {
  const groups = new Map<string, UnansweredGroup>();
  for (const event of events) {
    const question = typeof event.payload?.question === "string" ? event.payload.question : null;
    const reason = event.payload?.reason === "bilgi-yok" ? "bilgi-yok" : "kartsiz";
    if (!question) continue;
    const key = groupingKey(question);
    if (!key) continue;
    const at = event.createdAt.toISOString();
    const group = groups.get(key);
    if (!group) {
      groups.set(key, { question, count: 1, reason, lastAskedAt: at });
      continue;
    }
    group.count += 1;
    if (reason === "bilgi-yok") group.reason = "bilgi-yok";
    if (at > group.lastAskedAt) {
      group.lastAskedAt = at;
      group.question = question;
    }
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || b.lastAskedAt.localeCompare(a.lastAskedAt))
    .slice(0, limit);
}

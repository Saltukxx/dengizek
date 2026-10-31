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
  /** Otelci cevap ekledi: taslakta (yayın bekliyor) ya da yayında. */
  answer?: { status: "taslak" | "yayinda"; text: string };
}

// ---------------------------------------------------------------------------
// Otelcinin cevabı → otel ifadesi (aiFacts)
// ---------------------------------------------------------------------------

export const ANSWER_MAX_CHARS = 240;
const ANSWER_SEPARATOR = " — ";

/**
 * Otel ifadesi metni: "Kese var mı? — Evet, hamamda ücretli kese hizmeti var."
 * Soru metni kartın konusunu taşır (rehber bu kartı bu soruda bulur), cevap
 * otelcinin kendi cümlesidir.
 */
export function answerFactText(question: string, answer: string): string {
  const q = question.replace(/\s+/g, " ").trim();
  const a = answer.replace(/\s+/g, " ").trim();
  return `${/[?？]$/.test(q) ? q : `${q}?`}${ANSWER_SEPARATOR}${a}`;
}

/** Bu ifade, verilen soru için eklenmiş bir cevap mı? Cevap kısmını döner. */
export function answerFor(question: string, facts: string[]): string | null {
  const key = groupingKey(question);
  for (const fact of facts) {
    const at = fact.indexOf(ANSWER_SEPARATOR);
    if (at > 0 && groupingKey(fact.slice(0, at)) === key) return fact.slice(at + ANSWER_SEPARATOR.length);
  }
  return null;
}

/**
 * Cevapsız sorulara otelcinin eklediği cevabı işler. Yayındaki cevap öncelikli;
 * cevaplananlar listenin sonuna iner (önce cevap bekleyenler).
 */
export function withAnswerStatus(groups: UnansweredGroup[], draftFacts: string[], publishedFacts: string[]): UnansweredGroup[] {
  return groups
    .map((group) => {
      const published = answerFor(group.question, publishedFacts);
      if (published) return { ...group, answer: { status: "yayinda" as const, text: published } };
      const draft = answerFor(group.question, draftFacts);
      return draft ? { ...group, answer: { status: "taslak" as const, text: draft } } : group;
    })
    .sort((a, b) => Number(Boolean(a.answer)) - Number(Boolean(b.answer)));
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

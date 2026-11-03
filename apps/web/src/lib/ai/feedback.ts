// ---------------------------------------------------------------------------
// Misafir değerlendirmesi — rehber cevabının altındaki 👍/👎.
//
// Gizlilik: soru ve cevap metninde iletişim bilgisi maskelenir, uzunluk
// sınırlanır; IP, oturum ya da kimlik yazılmaz. Olay yalnız sunucudan
// (/api/tour/feedback) yazılır.
// ---------------------------------------------------------------------------

import { redactContactInfo } from "@/lib/contact-guard";
import { classifyQuestionTopic, QUESTION_TOPIC_LABELS, type QuestionTopic } from "@/lib/ai/question-log";
import { groupingKey } from "@/lib/ai/text";

export const FEEDBACK_EVENT = "ai_feedback";
export type FeedbackRating = "up" | "down";

const clean = (value: string, max: number) => redactContactInfo(value.replace(/\s+/g, " ").trim()).slice(0, max);

export interface FeedbackPayload {
  rating: FeedbackRating;
  messageId: string;
  question: string;
  key: string;
  topic: QuestionTopic;
  answer: string;
  tourId: string;
}

export function feedbackPayload(input: {
  rating: FeedbackRating;
  messageId: string;
  question: string;
  answer: string;
  tourId: string;
}): FeedbackPayload {
  const question = clean(input.question, 200);
  return {
    rating: input.rating,
    messageId: input.messageId.slice(0, 100),
    question,
    key: groupingKey(question),
    topic: classifyQuestionTopic(question),
    answer: clean(input.answer, 300),
    tourId: input.tourId.slice(0, 100),
  };
}

export interface FeedbackGroup {
  question: string;
  /** En son verilen cevap (misafirin beğenmediği). */
  answer: string;
  count: number;
  lastAt: string;
}

export interface FeedbackSummary {
  up: number;
  down: number;
  /** up / (up + down); oy yoksa null. */
  positiveRate: number | null;
  byTopic: Array<{ topic: QuestionTopic; label: string; up: number; down: number }>;
  /** En çok 👎 alan sorular. */
  topDown: FeedbackGroup[];
}

/**
 * Aynı cevaba (messageId) verilen oyların yalnız sonuncusu sayılır: misafir
 * fikrini değiştirebilir.
 */
export function summarizeFeedback(
  events: Array<{ payload: Record<string, unknown> | null; createdAt: Date }>,
  limit = 10,
): FeedbackSummary {
  const latest = new Map<string, { payload: Record<string, unknown>; createdAt: Date }>();
  for (const event of [...events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const p = event.payload ?? {};
    if (p.rating !== "up" && p.rating !== "down") continue;
    const id = typeof p.messageId === "string" && p.messageId ? p.messageId : `${event.createdAt.toISOString()}:${String(p.question)}`;
    latest.set(id, { payload: p, createdAt: event.createdAt });
  }

  let up = 0;
  let down = 0;
  const topics = new Map<QuestionTopic, { up: number; down: number }>();
  const downs = new Map<string, FeedbackGroup>();
  for (const { payload: p, createdAt } of latest.values()) {
    const question = typeof p.question === "string" ? p.question : "";
    const topic = (typeof p.topic === "string" && p.topic in QUESTION_TOPIC_LABELS ? p.topic : classifyQuestionTopic(question)) as QuestionTopic;
    const t = topics.get(topic) ?? { up: 0, down: 0 };
    if (p.rating === "up") {
      up += 1;
      t.up += 1;
    } else {
      down += 1;
      t.down += 1;
      const key = typeof p.key === "string" && p.key ? p.key : groupingKey(question);
      const at = createdAt.toISOString();
      const answer = typeof p.answer === "string" ? p.answer : "";
      const g = downs.get(key);
      if (!g) downs.set(key, { question, answer, count: 1, lastAt: at });
      else {
        g.count += 1;
        if (at > g.lastAt) Object.assign(g, { lastAt: at, question, answer });
      }
    }
    topics.set(topic, t);
  }

  return {
    up,
    down,
    positiveRate: up + down ? Math.round((up / (up + down)) * 1000) / 1000 : null,
    byTopic: [...topics.entries()]
      .map(([topic, v]) => ({ topic, label: QUESTION_TOPIC_LABELS[topic], ...v }))
      .sort((a, b) => b.up + b.down - (a.up + a.down)),
    topDown: [...downs.values()].sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt)).slice(0, limit),
  };
}

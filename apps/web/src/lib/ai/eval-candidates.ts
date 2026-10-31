// ---------------------------------------------------------------------------
// Gerçek misafir sorularından eval sorusu — haftalık döngü.
//
// 1. aday:   son N günün 👎 alan ve cevapsız kalan soruları otel bazında
//            gruplanır → .eval-cache/candidates-<tarih>.json (git'e girmez).
// 2. onay:   bir kişi dosyada "approve": true işaretler; isterse beklenen
//            cevabı yazar (expect.contains / expect.unknown).
// 3. ekleme: onaylananlar kişisel veri kontrolünden geçip repodaki
//            real-questions.json'a eklenir; real-questions.eval.ts koşar.
//
// Soru metinleri kayıtta zaten maskelidir; ekleme anında yeniden denetlenir.
// ---------------------------------------------------------------------------

import { containsContactInfo, redactContactInfo } from "@/lib/contact-guard";
import { classifyQuestionTopic, type QuestionTopic } from "@/lib/ai/question-log";
import { groupingKey } from "@/lib/ai/text";

export interface EvalExpectation {
  /** Görünen cevapta (metin + kart) geçmesi gereken ifadeler. */
  contains?: string[];
  /** Otelin verisinde yok: rehber "bilgim yok" demeli. */
  unknown?: boolean;
}

export interface EvalCandidate {
  id: string;
  hotel: string;
  question: string;
  topic: QuestionTopic;
  count: number;
  sources: { down: number; unanswered: number };
  /** Rehberin son verdiği cevap (👎 kaydından). */
  lastAnswer?: string;
  lastAt: string;
  /** İnceleyen kişi işaretler. */
  approve: boolean;
  expect: EvalExpectation;
  note?: string;
}

export interface RealQuestionFixture {
  id: string;
  hotel: string;
  question: string;
  topic: QuestionTopic;
  expect: EvalExpectation;
  addedAt: string;
}

interface SourceEvent {
  eventType: string;
  hotelSlug: string | null;
  payload: Record<string, unknown> | null;
  createdAt: Date;
}

const slugOf = (key: string) => key.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/**
 * 👎 (ai_feedback rating=down) ve cevapsız (ai_unanswered) olaylardan aday
 * listesi. Zaten eval setinde olan (otel + soru) atlanır. Sıra: önce 👎 alan,
 * sonra en çok tekrarlanan.
 */
export function buildCandidates(events: SourceEvent[], existing: Array<{ hotel: string; question: string }> = [], limit = 100): EvalCandidate[] {
  const known = new Set(existing.map((e) => `${e.hotel}|${groupingKey(e.question)}`));
  const groups = new Map<string, EvalCandidate>();
  for (const event of events) {
    const p = event.payload ?? {};
    const isDown = event.eventType === "ai_feedback" && p.rating === "down";
    const isUnanswered = event.eventType === "ai_unanswered";
    if ((!isDown && !isUnanswered) || !event.hotelSlug || typeof p.question !== "string" || !p.question.trim()) continue;
    const key = groupingKey(p.question);
    const id = `${event.hotelSlug}|${key}`;
    if (!key || known.has(id)) continue;
    const at = event.createdAt.toISOString();
    let group = groups.get(id);
    if (!group) {
      group = {
        id: `${event.hotelSlug}:${slugOf(key)}`,
        hotel: event.hotelSlug,
        question: p.question,
        topic: classifyQuestionTopic(p.question),
        count: 0,
        sources: { down: 0, unanswered: 0 },
        lastAt: at,
        approve: false,
        expect: {},
      };
      groups.set(id, group);
    }
    group.count += 1;
    if (isDown) group.sources.down += 1;
    else group.sources.unanswered += 1;
    if (at >= group.lastAt) {
      group.lastAt = at;
      group.question = p.question;
    }
    if (isDown && typeof p.answer === "string") group.lastAnswer = p.answer;
  }
  return [...groups.values()]
    .sort((a, b) => b.sources.down - a.sources.down || b.count - a.count || b.lastAt.localeCompare(a.lastAt))
    .slice(0, limit);
}

export interface PromoteResult {
  fixtures: RealQuestionFixture[];
  added: string[];
  /** Onaylı ama eklenemeyen (sebep). */
  rejected: Array<{ id: string; reason: string }>;
}

/** Onaylı adayları eval setine ekler; iletişim bilgisi kalmışsa reddeder. */
export function promoteCandidates(candidates: EvalCandidate[], fixtures: RealQuestionFixture[], today: string): PromoteResult {
  const out = [...fixtures];
  const added: string[] = [];
  const rejected: PromoteResult["rejected"] = [];
  const known = new Set(out.map((f) => `${f.hotel}|${groupingKey(f.question)}`));
  for (const c of candidates) {
    if (!c.approve) continue;
    const question = redactContactInfo(c.question.replace(/\s+/g, " ").trim());
    const contains = (c.expect?.contains ?? []).map((s) => s.trim()).filter(Boolean);
    if ([question, ...contains].some(containsContactInfo) || question !== c.question.replace(/\s+/g, " ").trim()) {
      rejected.push({ id: c.id, reason: "kişisel/iletişim bilgisi içeriyor — metni düzeltip tekrar deneyin" });
      continue;
    }
    if (known.has(`${c.hotel}|${groupingKey(question)}`)) {
      rejected.push({ id: c.id, reason: "zaten eval setinde" });
      continue;
    }
    out.push({
      id: c.id,
      hotel: c.hotel,
      question,
      topic: c.topic,
      expect: { ...(contains.length ? { contains } : {}), ...(c.expect?.unknown ? { unknown: true } : {}) },
      addedAt: today,
    });
    known.add(`${c.hotel}|${groupingKey(question)}`);
    added.push(c.id);
  }
  return { fixtures: out, added, rejected };
}

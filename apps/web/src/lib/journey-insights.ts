// ---------------------------------------------------------------------------
// Yolculuk analizi — aynı ziyaretin (visit_id) olaylarını birleştirip şu
// sorulara cevap verir:
//   · Tur: hangi adıma kaç ziyaretçi ulaştı, hangi adımdan sonra çıktı,
//     kaçı talebe geçti, ne kadar izledi.
//   · Soru → talep: hangi soruyu soranların ne kadarı talep gönderdi, talepten
//     hemen önce en son ne soruldu, rehberi kullananlar kullanmayanlara göre
//     ne kadar dönüştü.
//   · Yapay zekâ: soru hacmi, yüzey, sonuç, cevap süresi, token, değerlendirme.
//
// Saf fonksiyonlar: DB satırlarını alır, özet döner (API'ler ve testler ortak).
// ---------------------------------------------------------------------------

import { QUESTION_EVENT, questionSurface, type ChatSurface, type QuestionOutcome, type QuestionTopic } from "@/lib/ai/question-log";
import { FEEDBACK_EVENT } from "@/lib/ai/feedback";

export interface JourneyEventRow {
  eventType: string;
  payload: Record<string, unknown>;
  visitId: string | null;
  hotelSlug: string | null;
  createdAt: Date;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const rate = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

function byVisit(rows: JourneyEventRow[]): Map<string, JourneyEventRow[]> {
  const map = new Map<string, JourneyEventRow[]>();
  for (const row of rows) {
    if (!row.visitId) continue;
    const list = map.get(row.visitId) ?? [];
    list.push(row);
    map.set(row.visitId, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return map;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

// ---------------------------------------------------------------------------
// Tur çıkışları
// ---------------------------------------------------------------------------

export interface TourStepMeta {
  stepId: string;
  title: string;
  order: number;
}

export type TourExitReason = "talep" | "sayfa-degisti" | "kapatti" | "bilinmiyor";

export const TOUR_EXIT_REASON_LABELS: Record<TourExitReason, string> = {
  talep: "Talebe geçti",
  "sayfa-degisti": "Başka sayfaya geçti",
  kapatti: "Sekmeyi kapattı",
  bilinmiyor: "Kayıt yok (son adımdan çıkarıldı)",
};

export interface TourStepFunnel extends TourStepMeta {
  /** Bu adımı gören ziyaret sayısı. */
  reached: number;
  /** Turu bu adımda bırakan (tamamlamadan, talebe geçmeden) ziyaretler. */
  droppedHere: number;
  /** Bu adımdayken talebe geçen ziyaretler. */
  inquiryHere: number;
  /** Bu adıma ulaşanların yüzde kaçı burada bıraktı. */
  dropRate: number | null;
}

export interface TourFunnel {
  hotelSlug: string;
  tourId: string;
  visits: number;
  completed: number;
  completionRate: number | null;
  wentToInquiry: number;
  /** İzleme süresi (çıkış kaydı olan ziyaretler). */
  medianWatchSec: number | null;
  exitReasons: Record<TourExitReason, number>;
  steps: TourStepFunnel[];
}

interface VisitTourState {
  steps: Set<string>;
  lastStep: string | null;
  completed: boolean;
  reason: TourExitReason;
  watchedSec: number | null;
}

/**
 * Ziyaret × tur başına son durumu çıkarır. tour_exit kaydı varsa o esastır;
 * yoksa (mobilde pagehide gelmeyebilir) son görülen adım çıkış adımı sayılır.
 */
export function summarizeTours(rows: JourneyEventRow[], stepMeta: Map<string, TourStepMeta[]> = new Map()): TourFunnel[] {
  const tourKey = (hotelSlug: string, tourId: string) => `${hotelSlug}::${tourId}`;
  const states = new Map<string, Map<string, VisitTourState>>();

  for (const [visitId, events] of byVisit(rows)) {
    for (const e of events) {
      const tourId = str(e.payload.tourId);
      if (!tourId || !e.hotelSlug) continue;
      if (!["tour_start", "tour_step_view", "tour_complete", "tour_exit"].includes(e.eventType)) continue;
      const key = tourKey(e.hotelSlug, tourId);
      const perTour = states.get(key) ?? new Map<string, VisitTourState>();
      states.set(key, perTour);
      const st = perTour.get(visitId) ?? { steps: new Set(), lastStep: null, completed: false, reason: "bilinmiyor", watchedSec: null };
      perTour.set(visitId, st);
      const stepId = str(e.payload.stepId);
      if (e.eventType === "tour_step_view" && stepId) {
        st.steps.add(stepId);
        st.lastStep = stepId;
      } else if (e.eventType === "tour_complete") {
        st.completed = true;
      } else if (e.eventType === "tour_exit") {
        if (stepId) {
          st.steps.add(stepId);
          st.lastStep = stepId;
        }
        if (e.payload.completed === true) st.completed = true;
        const reason = str(e.payload.reason);
        st.reason = reason === "talep" || reason === "sayfa-degisti" || reason === "kapatti" ? reason : "bilinmiyor";
        st.watchedSec = num(e.payload.watchedSec);
      }
    }
  }

  const funnels: TourFunnel[] = [];
  for (const [key, perTour] of states) {
    const [hotelSlug, tourId] = key.split("::");
    const visits = [...perTour.values()].filter((v) => v.steps.size > 0);
    if (visits.length === 0) continue;

    const meta = stepMeta.get(key) ?? [];
    const metaById = new Map(meta.map((m) => [m.stepId, m]));
    // Manifestte olmayan (silinmiş) adımlar da görünür kalsın.
    const seenIds = new Set(visits.flatMap((v) => [...v.steps]));
    const allSteps: TourStepMeta[] = [
      ...meta,
      ...[...seenIds].filter((id) => !metaById.has(id)).map((id, i) => ({ stepId: id, title: id, order: 10_000 + i })),
    ].sort((a, b) => a.order - b.order);

    const exitReasons: Record<TourExitReason, number> = { talep: 0, "sayfa-degisti": 0, kapatti: 0, bilinmiyor: 0 };
    for (const v of visits) exitReasons[v.reason] += 1;
    const watch = visits.map((v) => v.watchedSec).filter((s): s is number => s != null).sort((a, b) => a - b);
    const completed = visits.filter((v) => v.completed).length;

    funnels.push({
      hotelSlug,
      tourId,
      visits: visits.length,
      completed,
      completionRate: rate(completed, visits.length),
      wentToInquiry: exitReasons.talep,
      medianWatchSec: percentile(watch, 50),
      exitReasons,
      steps: allSteps.map((step) => {
        const reached = visits.filter((v) => v.steps.has(step.stepId)).length;
        const endedHere = visits.filter((v) => v.lastStep === step.stepId);
        const inquiryHere = endedHere.filter((v) => v.reason === "talep").length;
        const droppedHere = endedHere.filter((v) => !v.completed && v.reason !== "talep").length;
        return { ...step, reached, droppedHere, inquiryHere, dropRate: rate(droppedHere, reached) };
      }),
    });
  }
  return funnels.sort((a, b) => b.visits - a.visits);
}

// ---------------------------------------------------------------------------
// Soru → talep
// ---------------------------------------------------------------------------

export interface QuestionConversion {
  key: string;
  /** Örnek soru metni (90 gün sonra silinir; o zaman anahtar da yoktur). */
  question: string;
  topic: QuestionTopic | null;
  askedVisits: number;
  /** Bu soruyu sorduktan SONRA talep gönderen ziyaretler. */
  convertedVisits: number;
  conversionRate: number | null;
}

export interface ConversionSummary {
  /** Olayı olan ziyaretler (yolculuk izlenebilenler). */
  visits: number;
  visitsWithQuestion: number;
  visitsWithInquiry: number;
  /** Rehbere soru soranlarda talep oranı. */
  askedConversionRate: number | null;
  /** Hiç soru sormayanlarda talep oranı — karşılaştırma tabanı. */
  notAskedConversionRate: number | null;
  /** Talepten hemen önce sorulan son soru — en sık olanlar. */
  lastQuestionBeforeInquiry: Array<{ key: string; question: string; count: number }>;
  /** Soru başına dönüşüm — en az MIN_ASKED ziyarette sorulanlar. */
  byQuestion: QuestionConversion[];
  byTopic: Array<{ topic: QuestionTopic; askedVisits: number; convertedVisits: number; conversionRate: number | null }>;
}

const MIN_ASKED = 2;

export function summarizeConversion(rows: JourneyEventRow[], limit = 15): ConversionSummary {
  const visits = byVisit(rows);
  let visitsWithQuestion = 0;
  let visitsWithInquiry = 0;
  let askedAndConverted = 0;
  let notAskedAndConverted = 0;
  const lastBefore = new Map<string, { question: string; count: number }>();
  const perKey = new Map<string, { question: string; topic: QuestionTopic | null; asked: number; converted: number }>();
  const perTopic = new Map<QuestionTopic, { asked: number; converted: number }>();

  for (const events of visits.values()) {
    const questions = events.filter((e) => e.eventType === QUESTION_EVENT && str(e.payload.key));
    const inquiries = events.filter((e) => e.eventType === "inquiry_submit");
    const lastInquiryAt = inquiries.at(-1)?.createdAt.getTime() ?? null;
    if (questions.length > 0) visitsWithQuestion += 1;
    if (inquiries.length > 0) visitsWithInquiry += 1;
    if (inquiries.length > 0 && questions.length > 0 && questions[0].createdAt.getTime() <= (lastInquiryAt ?? 0)) {
      askedAndConverted += 1;
    }
    if (inquiries.length > 0 && questions.length === 0) notAskedAndConverted += 1;

    // Her talep için ondan hemen önceki soru.
    for (const inquiry of inquiries) {
      const before = questions.filter((q) => q.createdAt <= inquiry.createdAt).at(-1);
      const key = before && str(before.payload.key);
      if (!before || !key) continue;
      const entry = lastBefore.get(key) ?? { question: str(before.payload.question) ?? key, count: 0 };
      entry.count += 1;
      lastBefore.set(key, entry);
    }

    // Soru ve konu başına: ziyaret bir kez sayılır; talep sorudan sonra geldiyse dönüşmüş.
    const seenKeys = new Set<string>();
    const seenTopics = new Set<QuestionTopic>();
    for (const q of questions) {
      const key = str(q.payload.key) as string;
      const topic = (str(q.payload.topic) as QuestionTopic | null) ?? null;
      const converted = lastInquiryAt != null && lastInquiryAt >= q.createdAt.getTime();
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        const entry = perKey.get(key) ?? { question: str(q.payload.question) ?? key, topic, asked: 0, converted: 0 };
        entry.asked += 1;
        if (converted) entry.converted += 1;
        perKey.set(key, entry);
      }
      if (topic && !seenTopics.has(topic)) {
        seenTopics.add(topic);
        const entry = perTopic.get(topic) ?? { asked: 0, converted: 0 };
        entry.asked += 1;
        if (converted) entry.converted += 1;
        perTopic.set(topic, entry);
      }
    }
  }

  const visitsWithoutQuestion = visits.size - visitsWithQuestion;
  return {
    visits: visits.size,
    visitsWithQuestion,
    visitsWithInquiry,
    askedConversionRate: rate(askedAndConverted, visitsWithQuestion),
    notAskedConversionRate: rate(notAskedAndConverted, visitsWithoutQuestion),
    lastQuestionBeforeInquiry: [...lastBefore]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit),
    byQuestion: [...perKey]
      .filter(([, v]) => v.asked >= MIN_ASKED)
      .map(([key, v]) => ({
        key,
        question: v.question,
        topic: v.topic,
        askedVisits: v.asked,
        convertedVisits: v.converted,
        conversionRate: rate(v.converted, v.asked),
      }))
      .sort((a, b) => b.convertedVisits - a.convertedVisits || b.askedVisits - a.askedVisits)
      .slice(0, limit),
    byTopic: [...perTopic]
      .map(([topic, v]) => ({ topic, askedVisits: v.asked, convertedVisits: v.converted, conversionRate: rate(v.converted, v.asked) }))
      .sort((a, b) => b.askedVisits - a.askedVisits),
  };
}

// ---------------------------------------------------------------------------
// Yapay zekâ özeti
// ---------------------------------------------------------------------------

export interface AiOverview {
  questions: number;
  bySurface: Record<ChatSurface, number>;
  byOutcome: Partial<Record<QuestionOutcome, number>>;
  medianLatencyMs: number | null;
  p90LatencyMs: number | null;
  inputTokens: number;
  outputTokens: number;
  feedbackUp: number;
  feedbackDown: number;
}

export function summarizeAi(rows: JourneyEventRow[]): AiOverview {
  const questions = rows.filter((r) => r.eventType === QUESTION_EVENT);
  const bySurface: Record<ChatSurface, number> = { tur: 0, "otel-sayfasi": 0 };
  const byOutcome: Partial<Record<QuestionOutcome, number>> = {};
  const latencies: number[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  for (const q of questions) {
    bySurface[questionSurface(q.payload)] += 1;
    const outcome = str(q.payload.outcome) as QuestionOutcome | null;
    if (outcome) byOutcome[outcome] = (byOutcome[outcome] ?? 0) + 1;
    const latency = num(q.payload.latencyMs);
    if (latency != null) latencies.push(latency);
    inputTokens += num(q.payload.inputTokens) ?? 0;
    outputTokens += num(q.payload.outputTokens) ?? 0;
  }
  latencies.sort((a, b) => a - b);
  const feedback = rows.filter((r) => r.eventType === FEEDBACK_EVENT);
  return {
    questions: questions.length,
    bySurface,
    byOutcome,
    medianLatencyMs: percentile(latencies, 50),
    p90LatencyMs: percentile(latencies, 90),
    inputTokens,
    outputTokens,
    feedbackUp: feedback.filter((f) => f.payload.rating === "up").length,
    feedbackDown: feedback.filter((f) => f.payload.rating === "down").length,
  };
}

/** Bu analizlerin okuduğu olay türleri — API sorgusu bunlarla sınırlanır. */
export const JOURNEY_QUERY_EVENT_TYPES = [
  "hotel_view",
  "hotel_chat_open",
  "tour_start",
  "tour_step_view",
  "tour_complete",
  "tour_exit",
  "inquiry_start",
  "inquiry_submit",
  QUESTION_EVENT,
  FEEDBACK_EVENT,
] as const;

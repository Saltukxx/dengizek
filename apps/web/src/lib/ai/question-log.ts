// ---------------------------------------------------------------------------
// Rehber soru kayıtları — misafirin AI rehbere sorduğu HER soru (cevaplanan
// ya da cevaplanamayan). Analiz için: en çok sorulan sorular, hangi otele ne
// soruluyor, konu dağılımı, cevaplanma oranı.
//
// Cevapsız sorular (unanswered.ts) ayrı kalır: otel panelindeki "eksik bilgi"
// listesi o olaydan beslenir. Bu kayıt onun üst kümesidir.
//
// Gizlilik: soru ve cevap metninde iletişim bilgisi maskelenir, uzunluk
// sınırlanır. IP, oturum ya da misafir kimliği yazılmaz. Olay yalnız
// sunucudan yazılır; misafir tarafı (/api/analytics/track) bu türü gönderemez.
// ---------------------------------------------------------------------------

import { redactContactInfo } from "@/lib/contact-guard";
import { groupingKey, normalizeText } from "@/lib/ai/text";
import { isQuestionLike } from "@/lib/ai/unanswered";

export const QUESTION_EVENT = "ai_question";
const MAX_QUESTION_CHARS = 200;
const MAX_ANSWER_CHARS = 300;

// ---------------------------------------------------------------------------
// Konu sınıflandırması — sorunun metninden, cevaptan bağımsız
// ---------------------------------------------------------------------------

export type QuestionTopic =
  | "evcil-hayvan"
  | "giris-cikis"
  | "fiyat"
  | "musaitlik-rezervasyon"
  | "konum-ulasim"
  | "yeme-icme"
  | "havuz-spa"
  | "oda"
  | "olanak"
  | "iletisim"
  | "diger";

export const QUESTION_TOPIC_LABELS: Record<QuestionTopic, string> = {
  "evcil-hayvan": "Evcil hayvan",
  "giris-cikis": "Giriş / çıkış",
  fiyat: "Fiyat",
  "musaitlik-rezervasyon": "Müsaitlik / rezervasyon",
  "konum-ulasim": "Konum / ulaşım",
  "yeme-icme": "Yeme-içme / pansiyon",
  "havuz-spa": "Havuz / termal / spa",
  oda: "Oda",
  olanak: "Diğer olanaklar",
  iletisim: "İletişim",
  diger: "Diğer",
};

/** Sıra önemli: ilk eşleşen konu kazanır ("odada köpek kalabilir mi?" → evcil hayvan). */
const TOPIC_PATTERNS: Array<[QuestionTopic, RegExp]> = [
  ["evcil-hayvan", /\b(evcil|kopek|kopeg|kedi|hayvan)|\b(pets?|dogs?|cats?)\b/],
  ["giris-cikis", /\b(giris|cikis|checkin|checkout|erken giris|gec cikis|late checkout|early checkin)\b/],
  ["fiyat", /\b(fiyat|ucret|kac (tl|lira|para|euro|dolar)|ne kadar tutar|indirim|kampanya|price|cost|how much|rate|discount)/],
  ["musaitlik-rezervasyon", /\b(musait|bos oda|yer var|rezervasyon|iptal|kapora|on odeme|book|booking|availab|cancel)/],
  ["konum-ulasim", /\b(havaliman|havaalan|uzak|mesafe|km|nerede|konum|adres|transfer|servis|merkez|otogar|ulasim|airport|distance|where|location|shuttle)/],
  ["yeme-icme", /\b(yemek|yemeg|kahvalti|aksam|ogle|pansiyon|her sey dahil|hersey dahil|konsept|restoran|bar|alkol|meal|breakfast|dinner|lunch|all inclusive|board|restaurant)/],
  ["havuz-spa", /\b(havuz|termal|kaplica|spa|hamam|sauna|kese|masaj|jakuzi|buhar|pool|thermal|massage|jacuzzi)/],
  ["oda", /\b(oda|odalar|suit|yatak|kisilik|balkon|klima|minibar|manzara|room|suite|bed|balcony)/],
  ["olanak", /\b(otopark|park yeri|wifi|wi fi|internet|fitness|spor|cocuk|asansor|sarj|toplanti|parking|gym|kids?|elevator)/],
  ["iletisim", /\b(telefon|numara|e ?posta|mail|whatsapp|iletisim|phone|email|contact)/],
];

export function classifyQuestionTopic(message: string): QuestionTopic {
  const text = normalizeText(message);
  return TOPIC_PATTERNS.find(([, re]) => re.test(text))?.[0] ?? "diger";
}

// ---------------------------------------------------------------------------
// Kayıt
// ---------------------------------------------------------------------------

/**
 * cevaplandi: doğrulanmış kart/fiyat/oda listesiyle cevaplandı ·
 * bilgi-yok: "doğrulanmış bilgim yok" · yonlendirme: gezinme, talep formu,
 * iletişim, tarih sorma · model: model kart göstermeden kendi cevapladı.
 */
export type QuestionOutcome = "cevaplandi" | "bilgi-yok" | "yonlendirme" | "model";

export const QUESTION_OUTCOME_LABELS: Record<QuestionOutcome, string> = {
  cevaplandi: "Cevaplandı",
  "bilgi-yok": "Bilgi yok",
  yonlendirme: "Yönlendirildi",
  model: "Kartsız (model)",
};

export interface QuestionLogPayload {
  question: string;
  /** Gruplama anahtarı (büyük/küçük harf, Türkçe karakter, noktalama farkı yok). */
  key: string;
  topic: QuestionTopic;
  outcome: QuestionOutcome;
  /** Cevabı kim üretti: sunucu (kural) ya da model. */
  source: "sunucu" | "model";
  language: string | null;
  tools: string[];
  /** Gösterilen bilgi kartları (fact id). */
  factIds: string[];
  answer: string;
  tourId: string | null;
}

export interface QuestionLogInput {
  question: string;
  answer: string;
  outcome: QuestionOutcome;
  source: "sunucu" | "model";
  language?: string | null;
  tools?: string[];
  factIds?: string[];
  tourId?: string | null;
}

const clean = (value: string, max: number) => redactContactInfo(value.replace(/\s+/g, " ").trim()).slice(0, max);

/** Soru değilse (selam, teşekkür) null — kaydedilmez. */
export function questionLogPayload(input: QuestionLogInput): QuestionLogPayload | null {
  if (!isQuestionLike(input.question)) return null;
  const question = clean(input.question, MAX_QUESTION_CHARS);
  const key = groupingKey(question);
  if (!key) return null;
  return {
    question,
    key,
    topic: classifyQuestionTopic(question),
    outcome: input.outcome,
    source: input.source,
    language: input.language ?? null,
    tools: [...new Set(input.tools ?? [])],
    factIds: [...new Set(input.factIds ?? [])].slice(0, 5),
    answer: clean(input.answer, MAX_ANSWER_CHARS),
    tourId: input.tourId ?? null,
  };
}

/** Araç sonuçlarından sonucu çıkarır (sunucu turu ve model turu için ortak). */
export function outcomeFromTools(
  runs: Array<{ toolName: string; output: unknown }>,
  opts: { unknownReply?: boolean; redirectReply?: boolean } = {},
): QuestionOutcome {
  const ok = (r: { output: unknown }) => (r.output as { ok?: boolean } | null)?.ok !== false;
  if (opts.unknownReply) return "bilgi-yok";
  if (runs.some((r) => (r.toolName === "citeFact" || r.toolName === "getRoomPrice") && ok(r))) return "cevaplandi";
  if (runs.some((r) => r.toolName === "citeFact" && !ok(r))) return "bilgi-yok";
  if (opts.redirectReply || runs.some((r) => r.toolName === "navigateTo" || r.toolName === "openInquiry")) return "yonlendirme";
  return "model";
}

/** Gösterilen fact kartlarının id'leri. */
export function factIdsFromTools(runs: Array<{ toolName: string; input: unknown; output: unknown }>): string[] {
  return runs
    .filter((r) => r.toolName === "citeFact" && (r.output as { ok?: boolean } | null)?.ok !== false)
    .map((r) => (r.input as { factId?: unknown } | null)?.factId)
    .filter((id): id is string => typeof id === "string");
}

// ---------------------------------------------------------------------------
// Özet
// ---------------------------------------------------------------------------

export interface QuestionGroup {
  question: string;
  count: number;
  topic: QuestionTopic;
  /** Kaç farklı otelde soruldu. */
  hotels: number;
  /** Bu soruda "bilgi yok" ya da kartsız kalma sayısı. */
  unanswered: number;
  lastAt: string;
}

export interface QuestionInsights {
  total: number;
  /** cevaplandi / toplam (0-1); kayıt yoksa null. */
  answerRate: number | null;
  byOutcome: Array<{ outcome: QuestionOutcome; label: string; count: number }>;
  byTopic: Array<{ topic: QuestionTopic; label: string; count: number; unanswered: number }>;
  byHotel: Array<{ hotelSlug: string; count: number; unanswered: number }>;
  byLanguage: Array<{ language: string; count: number }>;
  topQuestions: QuestionGroup[];
  /** En çok tekrarlanan cevapsız sorular (bilgi-yok + model). */
  topUnanswered: QuestionGroup[];
}

const isUnanswered = (o: unknown) => o === "bilgi-yok" || o === "model";

function isTopic(value: unknown): value is QuestionTopic {
  return typeof value === "string" && value in QUESTION_TOPIC_LABELS;
}

function isOutcome(value: unknown): value is QuestionOutcome {
  return typeof value === "string" && value in QUESTION_OUTCOME_LABELS;
}

export function summarizeQuestions(
  events: Array<{ payload: Record<string, unknown> | null; hotelSlug: string | null; createdAt: Date }>,
  limit = 20,
): QuestionInsights {
  const groups = new Map<string, QuestionGroup & { hotelSet: Set<string> }>();
  const outcomes = new Map<QuestionOutcome, number>();
  const topics = new Map<QuestionTopic, { count: number; unanswered: number }>();
  const hotels = new Map<string, { count: number; unanswered: number }>();
  const languages = new Map<string, number>();
  let total = 0;

  for (const event of events) {
    const p = event.payload ?? {};
    if (typeof p.question !== "string" || !p.question) continue;
    total += 1;
    const outcome: QuestionOutcome = isOutcome(p.outcome) ? p.outcome : "model";
    const topic: QuestionTopic = isTopic(p.topic) ? p.topic : classifyQuestionTopic(p.question);
    const missed = isUnanswered(outcome) ? 1 : 0;

    outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);
    const t = topics.get(topic) ?? { count: 0, unanswered: 0 };
    t.count += 1;
    t.unanswered += missed;
    topics.set(topic, t);
    if (event.hotelSlug) {
      const h = hotels.get(event.hotelSlug) ?? { count: 0, unanswered: 0 };
      h.count += 1;
      h.unanswered += missed;
      hotels.set(event.hotelSlug, h);
    }
    const language = typeof p.language === "string" && p.language ? p.language : "?";
    languages.set(language, (languages.get(language) ?? 0) + 1);

    const key = typeof p.key === "string" && p.key ? p.key : groupingKey(p.question);
    const at = event.createdAt.toISOString();
    const group = groups.get(key);
    if (!group) {
      groups.set(key, {
        question: p.question,
        count: 1,
        topic,
        hotels: 0,
        hotelSet: new Set(event.hotelSlug ? [event.hotelSlug] : []),
        unanswered: missed,
        lastAt: at,
      });
    } else {
      group.count += 1;
      group.unanswered += missed;
      if (event.hotelSlug) group.hotelSet.add(event.hotelSlug);
      if (at > group.lastAt) Object.assign(group, { lastAt: at, question: p.question });
    }
  }

  const all: QuestionGroup[] = [...groups.values()].map(({ hotelSet, ...g }) => ({ ...g, hotels: hotelSet.size }));
  const byCount = (a: QuestionGroup, b: QuestionGroup) => b.count - a.count || b.lastAt.localeCompare(a.lastAt);
  const answered = outcomes.get("cevaplandi") ?? 0;

  return {
    total,
    answerRate: total ? Math.round((answered / total) * 1000) / 1000 : null,
    byOutcome: [...outcomes.entries()]
      .map(([outcome, count]) => ({ outcome, label: QUESTION_OUTCOME_LABELS[outcome], count }))
      .sort((a, b) => b.count - a.count),
    byTopic: [...topics.entries()]
      .map(([topic, v]) => ({ topic, label: QUESTION_TOPIC_LABELS[topic], ...v }))
      .sort((a, b) => b.count - a.count),
    byHotel: [...hotels.entries()]
      .map(([hotelSlug, v]) => ({ hotelSlug, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit),
    byLanguage: [...languages.entries()].map(([language, count]) => ({ language, count })).sort((a, b) => b.count - a.count),
    topQuestions: [...all].sort(byCount).slice(0, limit),
    topUnanswered: all
      .filter((g) => g.unanswered > 0)
      .sort((a, b) => b.unanswered - a.unanswered || byCount(a, b))
      .slice(0, limit),
  };
}

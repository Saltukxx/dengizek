// ---------------------------------------------------------------------------
// Sunucu tarafında araç çalıştırma — fiyat, otel bilgisi ve rezervasyon
// talebi sorularında aracı modele bırakmadan biz çağırırız.
//
// Neden: dil modelleri aracı atlayıp fiyat veya bilgi uydurabiliyor; bazı
// sağlayıcılar "bu aracı mutlaka çağır" (tool_choice) komutunu da
// uygulamıyor. Kart turları modelden bağımsız, öngörülebilir ve ucuz kalır. Burada soru deterministik olarak çözülür, sonuç kart
// olarak gönderilir ve model yalnızca kısa bir çerçeve cümlesi yazar.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import { embedMany } from "ai";
import { cosineSimilarity } from "@/lib/ai/embeddings";
import { EMBEDDING_PROVIDER_OPTIONS, getEmbeddingModel } from "@/lib/ai/llm";
import type { RoomPriceQuery } from "@/lib/ai/price-engine";
import type { AiFactCatalogEntry } from "@/lib/ai/types";

// ---------------------------------------------------------------------------
// Metin normalleştirme
// ---------------------------------------------------------------------------

/** Küçük harf, Türkçe karakterleri sadeleştirir, check-in/out'u tek kelime yapar. */
export function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .replace(/â/g, "a")
    .replace(/check[\s_-]?in/g, "checkin")
    .replace(/check[\s_-]?out/g, "checkout")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return normalizeText(value).split(" ").filter((t) => t.length >= 3);
}

/**
 * Türkçe ekleri tolere eden eşleşme: kısa kelime uzunun başıysa eşleşir
 * ("hayvan" ↔ "hayvanlari"). Ortak önek yetmez — "checkin" ≠ "checkout".
 */
function stemMatch(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 3 && long.startsWith(short);
}

// ---------------------------------------------------------------------------
// Fiyat sorgusu çıkarımı
// ---------------------------------------------------------------------------

const MONTHS: Array<[number, string[]]> = [
  [1, ["ocak", "jan"]],
  [2, ["subat", "feb"]],
  [3, ["mart", "mar"]],
  [4, ["nisan", "apr"]],
  [5, ["mayis", "may"]],
  [6, ["haziran", "jun"]],
  [7, ["temmuz", "jul"]],
  [8, ["agustos", "aug"]],
  [9, ["eylul", "sep"]],
  [10, ["ekim", "oct"]],
  [11, ["kasim", "nov"]],
  [12, ["aralik", "dec"]],
];

function monthFromWord(word: string): number | null {
  for (const [month, prefixes] of MONTHS) {
    if (prefixes.some((p) => word.startsWith(p))) return month;
  }
  return null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Yıl verilmemişse: bu yıl, tarih geçmişse gelecek yıl. */
function withYear(month: number, day: number, year: number | null, today: string): string | null {
  if (year) return isoDate(year, month, day);
  const thisYear = Number(today.slice(0, 4));
  const candidate = isoDate(thisYear, month, day);
  if (candidate && candidate >= today) return candidate;
  return isoDate(thisYear + 1, month, day);
}

const DAY = String.raw`\b(\d{1,2})`;
const MONTH_WORD = String.raw`([a-z]{3,})`;
const YEAR = String.raw`(?:\s+(\d{4}))?`;
const RANGE_SEP = String.raw`\s*(?:ile|ila|to|until|dan|den|tan|ten)\s*`;

/** İlk geçerli eşleşmeyi döndürür (ay adı olmayan "2 kişi" gibi eşleşmeleri atlar). */
function firstMatch<T>(text: string, pattern: string, build: (m: RegExpMatchArray) => T | null): T | null {
  for (const m of text.matchAll(new RegExp(pattern, "g"))) {
    const value = build(m);
    if (value) return value;
  }
  return null;
}

type DatePair = { checkIn: string; checkOut?: string };

/** Mesajdan giriş/çıkış tarihlerini çıkarır (TR + EN yazımlar). */
export function extractStayDates(
  message: string,
  today: string,
): { checkIn?: string; checkOut?: string } {
  const raw = message.toLocaleLowerCase("tr-TR");

  // 1) ISO tarihler: 2026-08-10
  const iso = [...raw.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)]
    .map((m) => isoDate(Number(m[1]), Number(m[2]), Number(m[3])))
    .filter((d): d is string => Boolean(d));
  // 2) Noktalı/eğik çizgili: 10.08.2026, 10/08/2026
  const dotted = [...raw.matchAll(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/g)]
    .map((m) => isoDate(Number(m[3]), Number(m[2]), Number(m[1])))
    .filter((d): d is string => Boolean(d));
  const explicit = iso.length ? iso : dotted;

  // 3) Serbest metin. Tireler "ila"ya çevrilir ("10-13 Ağustos" → "10 ila 13 agustos").
  const text = normalizeText(message.replace(/[-–—]/g, " ila ").replace(/[’']/g, " "));

  const pair: DatePair | null = explicit.length
    ? { checkIn: explicit[0]!, checkOut: explicit[1] }
    : // "10 agustos - 13 eylul 2026"
      firstMatch(text, `${DAY}\\s+${MONTH_WORD}${YEAR}${RANGE_SEP}${DAY}\\s+${MONTH_WORD}${YEAR}`, (m) => {
        const m1 = monthFromWord(m[2]!);
        const m2 = monthFromWord(m[5]!);
        if (!m1 || !m2) return null;
        const outYear = m[6] ? Number(m[6]) : null;
        const checkIn = withYear(m1, Number(m[1]), m[3] ? Number(m[3]) : outYear, today);
        if (!checkIn) return null;
        const checkOut = withYear(m2, Number(m[4]), outYear ?? Number(checkIn.slice(0, 4)), checkIn);
        return { checkIn, checkOut: checkOut ?? undefined };
      }) ??
      // "10-13 agustos 2026"
      firstMatch(text, `${DAY}${RANGE_SEP}${DAY}\\s+${MONTH_WORD}${YEAR}`, (m) => {
        const month = monthFromWord(m[3]!);
        if (!month) return null;
        const checkIn = withYear(month, Number(m[1]), m[4] ? Number(m[4]) : null, today);
        if (!checkIn) return null;
        return { checkIn, checkOut: isoDate(Number(checkIn.slice(0, 4)), month, Number(m[2])) ?? undefined };
      }) ??
      // "august 10-13 2026"
      firstMatch(text, `${MONTH_WORD}\\s+${DAY}${RANGE_SEP}${DAY}\\b${YEAR}`, (m) => {
        const month = monthFromWord(m[1]!);
        if (!month) return null;
        const checkIn = withYear(month, Number(m[2]), m[4] ? Number(m[4]) : null, today);
        if (!checkIn) return null;
        return { checkIn, checkOut: isoDate(Number(checkIn.slice(0, 4)), month, Number(m[3])) ?? undefined };
      }) ??
      // Tek tarih: "15 temmuz", "july 15"
      firstMatch(text, `${DAY}\\s+${MONTH_WORD}${YEAR}`, (m) => {
        const month = monthFromWord(m[2]!);
        const checkIn = month ? withYear(month, Number(m[1]), m[3] ? Number(m[3]) : null, today) : null;
        return checkIn ? { checkIn } : null;
      }) ??
      firstMatch(text, `${MONTH_WORD}\\s+${DAY}\\b${YEAR}`, (m) => {
        const month = monthFromWord(m[1]!);
        const checkIn = month ? withYear(month, Number(m[2]), m[3] ? Number(m[3]) : null, today) : null;
        return checkIn ? { checkIn } : null;
      });

  const resolved = pair ?? relativeStayDates(normalizeText(message), today);
  if (!resolved) return {};
  const { checkIn } = resolved;
  let checkOut = resolved.checkOut;
  if (checkOut && checkOut <= checkIn) {
    // "28 aralik - 2 ocak": çıkış ertesi yıla düşer.
    const next = isoDate(Number(checkOut.slice(0, 4)) + 1, Number(checkOut.slice(5, 7)), Number(checkOut.slice(8, 10)));
    checkOut = next && next > checkIn ? next : undefined;
  }
  if (!checkOut) {
    const nights = normalizeText(message).match(/\b(\d{1,2})\s*(?:gece|nights?)\b/);
    checkOut = addDays(checkIn, nights ? Math.max(1, Number(nights[1])) : 1);
  }
  return { checkIn, checkOut };
}


// ---------------------------------------------------------------------------
// Göreli tarihler: "yarın", "bu hafta sonu", "haftaya cuma", "next friday"
// ---------------------------------------------------------------------------

/** 0 = pazar … 6 = cumartesi */
const WEEKDAYS: Array<[number, RegExp]> = [
  [1, /\b(pazartesi|monday)/],
  [2, /\b(sali|tuesday)\b/],
  [3, /\b(carsamba|wednesday)/],
  [4, /\b(persembe|thursday)/],
  [5, /\b(cuma|friday)\b/],
  [6, /\b(cumartesi|saturday)/],
  [0, /\b(pazar|sunday)\b/],
];

function dayOfWeek(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/** Bugünden sonraki ilk `target` günü (1..7 gün ileri). */
function nextWeekday(today: string, target: number): string {
  const diff = (target - dayOfWeek(today) + 7) % 7 || 7;
  return addDays(today, diff);
}

/** Gelecek takvim haftasındaki (pazartesi başlangıçlı) `target` günü. */
function weekdayNextWeek(today: string, target: number): string {
  const mondayThisWeek = addDays(today, -((dayOfWeek(today) + 6) % 7));
  return addDays(mondayThisWeek, 7 + ((target + 6) % 7));
}

function relativeStayDates(text: string, today: string): DatePair | null {
  const nextWeek = /\b(haftaya|gelecek hafta|onumuzdeki hafta|next week|next)\b/.test(text);

  if (/\b(hafta ?sonu|weekend)/.test(text)) {
    // Hafta sonu = cuma girişi, pazar çıkışı (2 gece).
    const dow = dayOfWeek(today);
    let friday: string;
    if (nextWeek) friday = weekdayNextWeek(today, 5);
    else if (dow === 5 || dow === 6) friday = dow === 5 ? today : addDays(today, -1);
    else friday = nextWeekday(today, 5);
    const checkIn = friday < today ? today : friday;
    return { checkIn, checkOut: addDays(friday, 2) };
  }
  if (/\b(bugun|bu gece|today|tonight)\b/.test(text)) return { checkIn: today };
  if (/\b(yarin|tomorrow)\b/.test(text)) return { checkIn: addDays(today, 1) };

  for (const [target, re] of WEEKDAYS) {
    // "cumartesi" içindeki "cuma"yı ayrı eşleştirmemek için sıra önemli: önce uzun adlar denenir.
    if (target === 5 && /\bcumartesi/.test(text)) continue;
    if (target === 0 && /\bpazartesi/.test(text)) continue;
    if (re.test(text)) {
      return { checkIn: nextWeek ? weekdayNextWeek(today, target) : nextWeekday(today, target) };
    }
  }
  return null;
}

const NUMBER_WORDS: Record<string, number> = {
  bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
};

function countBefore(text: string, nouns: string): number | undefined {
  const m = text.match(new RegExp(`\\b(\\d{1,2}|${Object.keys(NUMBER_WORDS).join("|")})\\s+(?:${nouns})`));
  if (!m) return undefined;
  const n = /^\d+$/.test(m[1]!) ? Number(m[1]) : NUMBER_WORDS[m[1]!];
  return n && n > 0 && n <= 12 ? n : undefined;
}

/** Mesajdaki odayı oda adı / slug kelimeleriyle eşleştirir; belirsizse undefined. */
export function matchRoomSlug(
  message: string,
  rooms: Array<{ slug: string; name: string }>,
): string | undefined {
  const msgTokens = tokens(message);
  const squashed = normalizeText(message).replace(/\s+/g, "");
  const STOP = new Set(["oda", "odasi", "odalar", "room", "rooms", "suite", "the", "with", "ile"]);

  const scored = rooms.map((room) => {
    const roomTokens = [...new Set([...tokens(room.name), ...room.slug.split("-").filter((t) => t.length >= 3)])]
      .filter((t) => !STOP.has(t));
    const score = roomTokens.filter(
      (rt) => msgTokens.some((mt) => stemMatch(mt, rt)) || squashed.includes(rt),
    ).length;
    return { slug: room.slug, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  if (!best || best.score === 0) return undefined;
  if (second && second.score === best.score) return undefined;
  return best.slug;
}

export function extractPriceQuery(
  message: string,
  rooms: Array<{ slug: string; name: string }>,
  today: string,
): RoomPriceQuery {
  const text = normalizeText(message);
  const query: RoomPriceQuery = {};

  const roomSlug = matchRoomSlug(message, rooms);
  if (roomSlug) query.roomSlug = roomSlug;

  const dates = extractStayDates(message, today);
  if (dates.checkIn) query.checkIn = dates.checkIn;
  if (dates.checkOut) query.checkOut = dates.checkOut;

  const adults = countBefore(text, "yetiskin|adults?");
  const people = countBefore(text, "kisi|kisilik|people|persons?|guests?");
  const guestCount = adults ?? people;
  if (guestCount) query.guestCount = guestCount;

  const childAges = [...text.matchAll(/\b(\d{1,2})\s*(?:yasinda|yas|years? old|yo)\b/g)]
    .map((m) => Number(m[1]))
    .filter((age) => age >= 0 && age <= 17);
  if (childAges.length) query.childAges = childAges.slice(0, 10);

  return query;
}

// ---------------------------------------------------------------------------
// Fact seçimi — anlam benzerliği + kelime eşleşmesi
// ---------------------------------------------------------------------------

/** Fact ve tur adımı metinlerinin embedding'leri — süreç ömrü boyunca metin özetiyle önbelleklenir. */
const embeddingCache = new Map<string, number[]>();
const EMBEDDING_CACHE_LIMIT = 5_000;

function cacheKey(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}

/** Metinleri embed eder (önbellekten). Model yoksa/hata olursa eksik olanlar haritada yer almaz. */
async function embedCached(items: Array<{ id: string; text: string }>): Promise<Map<string, number[]>> {
  const missing = items.filter((item) => !embeddingCache.has(cacheKey(item.text)));
  if (missing.length) {
    const model = getEmbeddingModel();
    if (model) {
      try {
        const { embeddings } = await embedMany({
          model,
          values: missing.map((item) => item.text),
          maxRetries: 1,
          providerOptions: EMBEDDING_PROVIDER_OPTIONS,
        });
        if (embeddingCache.size + missing.length > EMBEDDING_CACHE_LIMIT) embeddingCache.clear();
        missing.forEach((item, i) => {
          const embedding = embeddings[i];
          if (embedding) embeddingCache.set(cacheKey(item.text), embedding);
        });
      } catch (err) {
        console.warn("[deterministic-tools] embedding başarısız, kelime eşleşmesine düşülüyor:", err);
      }
    }
  }
  const result = new Map<string, number[]>();
  for (const item of items) {
    const embedding = embeddingCache.get(cacheKey(item.text));
    if (embedding) result.set(item.id, embedding);
  }
  return result;
}

function factText(entry: AiFactCatalogEntry): string {
  return `${entry.hint}. ${entry.title ? `${entry.title}. ` : ""}${entry.text}`;
}

/** Her soruda geçen, ayırt edici olmayan kelimeler — eşleşme puanı vermez. */
const LEXICAL_STOPWORDS = new Set([
  "otel", "otelin", "oteliniz", "otelde", "hotel", "the", "bilgi", "hakkinda", "nedir", "neler",
  "var", "misiniz", "musunuz", "verir", "kac", "nasil", "what", "your", "about", "does", "have",
  "sahibi", "notu", "ifadesi", "statement", "spec", "policy", "manual",
]);

/** Doğrulanmış bilgi, otel sahibinin ifadesine yakın skorda öne geçer. */
const KIND_WEIGHT: Record<AiFactCatalogEntry["kind"], number> = {
  verified: 0.03,
  policy: 0,
  otel_ifadesi: -0.03,
};

function lexicalHits(message: string, target: string): number {
  const msgTokens = tokens(message).filter((t) => !LEXICAL_STOPWORDS.has(t));
  const targetTokens = tokens(target).filter((t) => !LEXICAL_STOPWORDS.has(t));
  const hits = msgTokens.filter((mt) => targetTokens.some((tt) => stemMatch(mt, tt))).length;
  return Math.min(hits, 2);
}

function lexicalScore(message: string, entry: AiFactCatalogEntry): number {
  return lexicalHits(message, `${entry.id.replace(/[._]/g, " ")} ${entry.hint} ${entry.title ?? ""}`);
}

export interface FactPick {
  factId: string;
  score: number;
  /** Mesajın konu kelimelerinden kaçı seçilen fact'in METNİNDE geçiyor. */
  textHits: number;
}

/** Konu kelimesi (4+ harf, soru kalıbı değil) fact metninde geçiyor mu? */
function textHits(message: string, entry: AiFactCatalogEntry): number {
  const terms = tokens(message).filter((t) => t.length >= 4 && !QUESTION_WORDS.has(t) && !LEXICAL_STOPWORDS.has(t));
  const factTokens = tokens(`${entry.title ?? ""} ${entry.text}`).filter((t) => t.length >= 4);
  return terms.filter((term) => factTokens.some((ft) => stemMatch(term, ft))).length;
}

/**
 * Soruya en uygun fact'i seçer. Skor: cosine benzerliği + başlık/ipucu ile
 * kelime eşleşmesi başına 0.1 (en fazla 2) + bilgi türü ağırlığı.
 * Embedding yoksa kelime eşleşmesi başına 0.25.
 */
export async function pickFact(
  message: string,
  messageEmbedding: number[] | null | undefined,
  catalog: AiFactCatalogEntry[],
): Promise<FactPick | null> {
  if (!catalog.length || !message.trim()) return null;
  const factEmbeddings = messageEmbedding
    ? await embedCached(catalog.map((entry) => ({ id: entry.id, text: factText(entry) })))
    : new Map<string, number[]>();

  // Embedding servisi kısmen başarısız olduysa ölçekler karışmasın: ya hepsi
  // anlam + kelime puanıyla ya hepsi yalnız kelime puanıyla değerlendirilir.
  const semanticMode = Boolean(messageEmbedding) && catalog.every((e) => factEmbeddings.has(e.id));

  let best: FactPick | null = null;
  for (const entry of catalog) {
    const lexical = lexicalScore(message, entry);
    const embedding = factEmbeddings.get(entry.id);
    // Embedding yoksa: 2 kelime eşleşmesi gerekir (tek kelime eşiği geçmez).
    const score =
      semanticMode && embedding && messageEmbedding
        ? cosineSimilarity(messageEmbedding, embedding) + lexical * 0.1 + KIND_WEIGHT[entry.kind]
        : lexical * 0.25;
    if (!best || score > best.score) best = { factId: entry.id, score, textHits: 0 };
  }
  if (best) {
    const entry = catalog.find((e) => e.id === best!.factId)!;
    best.textHits = textHits(message, entry);
  }
  return best;
}

// ---------------------------------------------------------------------------
// Plan — bu mesajda hangi araç sunucu tarafında çalışacak?
// ---------------------------------------------------------------------------

/**
 * Fact eşikleri — gemini-embedding-2 ile 6 otellik eval'da ölçüldü (Ekim 2026).
 * Anlam puanı tek başına ayırt etmiyor: "Köpeğimi getirebilir miyim?" (doğru
 * kart) ile "Kayak pisti var mı?" (kart yok) ikisi de ~0.65 alıyor. Bu yüzden
 * ipucu yoksa ya yüksek puan ya da "orta puan + konu kelimesi kartın metninde".
 */
/** Anahtar kelime ipucu varken kabul edilen en düşük fact skoru. */
const FACT_MIN_SCORE_WITH_HINT = Number(process.env.AI_FACT_MIN_SCORE_WITH_HINT) || 0.45;
/** İpucu yokken tek başına yeterli skor. */
const FACT_MIN_SCORE_WITHOUT_HINT = Number(process.env.AI_FACT_MIN_SCORE) || 0.7;
/** İpucu yokken, konu kelimesi kartın metninde geçiyorsa yeterli skor. */
const FACT_MIN_SCORE_WITH_TEXT_MATCH = Number(process.env.AI_FACT_MIN_SCORE_TEXT_MATCH) || 0.58;

const NAVIGATION_PATTERNS = [
  /\b(gor|goster|gez|gidelim|gecelim|bakalim|bakabilir)/,
  /\b(see|show|take me|go to|visit|look at)\b/,
];

/**
 * İletişim bilgisi soruları: rehber telefon/e-posta vermez (bkz. sistem
 * prompt'u İLETİŞİM KURALI) — fact kartı seçilmez, model talep formuna yönlendirir.
 */
const CONTACT_PATTERN =
  /\b(telefon|tel no|numara|e ?posta|mail|whatsapp|instagram|web ?site|iletisim|phone|email|contact|number)/;

export function hasContactIntent(message: string): boolean {
  return CONTACT_PATTERN.test(normalizeText(message));
}

export function hasNavigationIntent(message: string): boolean {
  const text = normalizeText(message);
  return NAVIGATION_PATTERNS.some((re) => re.test(text));
}

export interface TourStepOption {
  stepId: string;
  title: string;
  aiTags?: string[];
  aiDescription?: string;
}

const STEP_MIN_SCORE = Number(process.env.AI_STEP_MIN_SCORE) || 0.55;

function stepText(step: TourStepOption): string {
  return [step.title, step.aiTags?.join(", "), step.aiDescription].filter(Boolean).join(". ");
}

/**
 * Gezinme isteğini tur adımına eşler: anlam benzerliği + başlık/etiket
 * kelime eşleşmesi başına 0.2 (embedding yoksa 0.6). Misafirin zaten bulunduğu adım seçilmez.
 */
export async function pickStep(
  message: string,
  messageEmbedding: number[] | null | undefined,
  steps: TourStepOption[],
  currentStepId?: string,
): Promise<{ stepId: string; title: string; score: number } | null> {
  const candidates = steps.filter((s) => s.stepId !== currentStepId);
  if (!candidates.length) return null;
  const embeddings = messageEmbedding
    ? await embedCached(candidates.map((s) => ({ id: s.stepId, text: stepText(s) })))
    : new Map<string, number[]>();

  let best: { stepId: string; title: string; score: number } | null = null;
  for (const step of candidates) {
    const lexical = lexicalHits(message, `${step.title} ${step.aiTags?.join(" ") ?? ""}`);
    const embedding = embeddings.get(step.stepId);
    const semantic = embedding && messageEmbedding ? cosineSimilarity(messageEmbedding, embedding) : 0;
    // Embedding yoksa başlık/etiketteki tek kelime eşleşmesi yeterli (adım sayısı az, başlıklar ayırt edici).
    const score = embedding ? semantic + lexical * 0.2 : lexical * 0.6;
    if (!best || score > best.score) best = { stepId: step.stepId, title: step.title, score };
  }
  return best && best.score >= STEP_MIN_SCORE ? best : null;
}

export type PlannedToolCall =
  | { toolName: "navigateTo"; input: { stepId: string; reason: string } }
  | { toolName: "getRoomPrice"; input: RoomPriceQuery }
  | { toolName: "citeFact"; input: { factId: string } }
  | { toolName: "openInquiry"; input: { roomSlug?: string } };

/**
 * Sunucu planı:
 * - calls: modelden önce çalışacak araçlar (fiyat + bilgi aynı mesajda olabilir).
 * - reply "unknown": katalogda karşılığı olmayan "… var mı?" sorusu — model
 *   çağrılmaz, "doğrulanmış bilgim yok" cevabı verilir (uydurma "evet" riski).
 */
export interface ServerPlan {
  calls: PlannedToolCall[];
  /** unknown: katalog dışı konu · contact: iletişim bilgisi isteği (verilmez). */
  reply?: "unknown" | "contact";
}

// ---------------------------------------------------------------------------
// Sohbet hafızası — takip soruları ("Peki 15-18 Temmuz için?")
// ---------------------------------------------------------------------------

export interface ConversationContext {
  /** Son getRoomPrice sorgusu (sunucunun ya da modelin çağırdığı). */
  lastPriceQuery?: RoomPriceQuery;
  /** Mevcut mesaj HARİÇ, en yeniden eskiye kullanıcı mesajları. */
  previousUserTexts: string[];
}

type LooseMessage = { role?: string; content?: unknown; parts?: unknown };
type LoosePart = { type?: string; text?: unknown; input?: unknown; toolName?: unknown };

function messageText(message: LooseMessage): string {
  if (typeof message.content === "string") return message.content;
  const parts = (Array.isArray(message.parts) ? message.parts : Array.isArray(message.content) ? message.content : []) as LoosePart[];
  return parts.map((p) => (p?.type === "text" && typeof p.text === "string" ? p.text : "")).join("");
}

function priceInputOf(message: LooseMessage): RoomPriceQuery | undefined {
  const parts = [
    ...(Array.isArray(message.parts) ? message.parts : []),
    ...(Array.isArray(message.content) ? message.content : []),
  ] as LoosePart[];
  let found: RoomPriceQuery | undefined;
  for (const part of parts) {
    // UI mesajı: { type: "tool-getRoomPrice", input } — model mesajı: { type: "tool-call", toolName, input }
    const isPrice =
      part?.type === "tool-getRoomPrice" || (part?.type === "tool-call" && part.toolName === "getRoomPrice");
    if (isPrice && part.input && typeof part.input === "object") found = part.input as RoomPriceQuery;
  }
  return found;
}

/** Son 8 mesajdan fiyat bağlamını ve önceki kullanıcı mesajlarını çıkarır. */
export function extractConversationContext(messages: unknown[]): ConversationContext {
  const recent = (messages as LooseMessage[]).slice(-8);
  let lastPriceQuery: RoomPriceQuery | undefined;
  const userTexts: string[] = [];
  for (const message of recent) {
    if (message?.role === "assistant") {
      lastPriceQuery = priceInputOf(message) ?? lastPriceQuery;
    } else if (message?.role === "user") {
      const text = messageText(message).trim();
      if (text && text !== "[HIDDEN]") userTexts.push(text);
    }
  }
  userTexts.pop(); // mevcut mesaj
  return { lastPriceQuery, previousUserTexts: userTexts.reverse() };
}

/** "bu oda", "odanın fiyatı", "that room" gibi önceki odaya gönderme. */
const SINGULAR_ROOM_REFERENCE = /\b(bu oda|o oda|ayni oda|odanin|odasinin|fiyati|it|this room|that room|the room)\b/;

function hasStayDetails(query: RoomPriceQuery): boolean {
  return Boolean(query.checkIn || query.guestCount || query.childAges?.length || query.roomSlug);
}

/**
 * Fiyat sorgusunu sohbet bağlamıyla tamamlar: tarih/kişi sayısı aynı
 * yolculuk için taşınır; oda yalnızca mesaj odayı belirtmiyorsa ve takip
 * sorusu ya da tekil gönderme ("odanın fiyatı") varsa taşınır.
 */
export function mergePriceQuery(
  message: string,
  current: RoomPriceQuery,
  context: ConversationContext,
  rooms: Array<{ slug: string; name: string }>,
  isFollowUp: boolean,
): RoomPriceQuery {
  const previous = context.lastPriceQuery ?? {};
  const merged: RoomPriceQuery = {};

  let roomSlug = current.roomSlug;
  if (!roomSlug && (isFollowUp || SINGULAR_ROOM_REFERENCE.test(normalizeText(message)))) {
    roomSlug = previous.roomSlug;
    // Fiyat sorulmadan önce konuşulan oda: "Deluxe oda nasıl?" → "Fiyatı ne kadar?"
    for (const text of context.previousUserTexts.slice(0, 2)) {
      if (roomSlug) break;
      roomSlug = matchRoomSlug(text, rooms);
    }
  }
  if (roomSlug) merged.roomSlug = roomSlug;

  const checkIn = current.checkIn ?? previous.checkIn;
  const checkOut = current.checkIn ? current.checkOut : previous.checkOut;
  if (checkIn) merged.checkIn = checkIn;
  if (checkOut) merged.checkOut = checkOut;

  const guestCount = current.guestCount ?? previous.guestCount;
  if (guestCount) merged.guestCount = guestCount;
  const childAges = current.childAges ?? previous.childAges;
  if (childAges?.length) merged.childAges = childAges;
  return merged;
}

// ---------------------------------------------------------------------------
// "… var mı?" soruları
// ---------------------------------------------------------------------------

const AVAILABILITY_QUESTION =
  /\b(var mi|varmi|mevcut mu|bulunuyor mu|bulunur mu|sunuyor musunuz|sunuluyor mu|saglaniyor mu|do you have|is there|are there|do you offer)\b/;

const QUESTION_WORDS = new Set([
  "var", "varmi", "mevcut", "bulunuyor", "bulunur", "sunuyor", "sunuluyor", "saglaniyor",
  "musunuz", "misiniz", "otelde", "otelinizde", "otelin", "oteliniz", "hotel", "there",
  "have", "offer", "you", "the", "and", "veya", "ozel", "special", "icin", "bir",
]);

/** Mesajdaki asıl konu kelimelerinden biri katalogda (metin dahil) geçiyor mu? */
export function mentionsCatalogTerm(message: string, catalog: AiFactCatalogEntry[]): boolean {
  const terms = tokens(message).filter((t) => t.length >= 4 && !QUESTION_WORDS.has(t) && !LEXICAL_STOPWORDS.has(t));
  if (!terms.length) return true; // konu çıkarılamadı → modele bırak
  const catalogTokens = new Set(catalog.flatMap((e) => tokens(`${e.hint} ${e.title ?? ""} ${e.text}`)));
  return terms.some((term) => [...catalogTokens].some((ct) => ct.length >= 4 && stemMatch(term, ct)));
}

export function isAvailabilityQuestion(message: string): boolean {
  return AVAILABILITY_QUESTION.test(normalizeText(message));
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export async function planServerTools(args: {
  message: string;
  messageEmbedding: number[] | null | undefined;
  hints: { needsPriceTool: boolean; needsFactTool: boolean };
  /**
   * explicit: "rezervasyon yapmak istiyorum" gibi anahtar kelime eşleşmesi.
   * semantic: yalnız anlam benzerliği — "Fiyatlarınız ne kadar?" de "fiyat
   * teklifi istiyorum" örneğine benzeyebildiği için fiyat/gezinme isteğini ezmez.
   */
  inquiryIntent: "explicit" | "semantic" | "none";
  catalog: AiFactCatalogEntry[];
  rooms: Array<{ slug: string; name: string }>;
  steps?: TourStepOption[];
  currentStepId?: string;
  today: string;
  context?: ConversationContext;
}): Promise<ServerPlan> {
  const { message, hints } = args;
  const none: ServerPlan = { calls: [] };
  if (!message.trim()) return none;
  const context = args.context ?? { previousUserTexts: [] };
  const navigation = hasNavigationIntent(message);

  // Yalnız anlam benzerliğine dayanan niyet, fiyat veya gezinme isteğini ezmez:
  // "Odaları görebilir miyim?" rezervasyon cümlelerine benzeyebilir.
  const wantsInquiry =
    args.inquiryIntent === "explicit" ||
    (args.inquiryIntent === "semantic" && !hints.needsPriceTool && !navigation);
  if (wantsInquiry) {
    const roomSlug = matchRoomSlug(message, args.rooms);
    return { calls: [{ toolName: "openInquiry", input: roomSlug ? { roomSlug } : {} }] };
  }

  if (navigation && !hints.needsPriceTool) {
    const step = await pickStep(message, args.messageEmbedding, args.steps ?? [], args.currentStepId);
    if (step) {
      return {
        calls: [{ toolName: "navigateTo", input: { stepId: step.stepId, reason: `Misafir "${step.title}" alanını görmek istedi.` } }],
      };
    }
    if (!hints.needsFactTool) return none;
  }

  const calls: PlannedToolCall[] = [];

  // Fiyat: açık fiyat sorusu ya da fiyat konuşmasının devamı ("Peki 3 kişi olursak?").
  const priceDetails = extractPriceQuery(message, args.rooms, args.today);
  const isFollowUp =
    !hints.needsPriceTool &&
    !hints.needsFactTool &&
    Boolean(context.lastPriceQuery) &&
    hasStayDetails(priceDetails);
  if (hints.needsPriceTool || isFollowUp) {
    calls.push({
      toolName: "getRoomPrice",
      input: mergePriceQuery(message, priceDetails, context, args.rooms, isFollowUp),
    });
  }

  // İletişim bilgisi istenirse: rehber vermez, talep formuna yönlendirir.
  if (!calls.length && hasContactIntent(message)) return { calls: [], reply: "contact" };

  // Katalogda karşılığı olmayan "… var mı?" sorusu: kart aranmaz, model de
  // "evet" uyduramaz.
  if (!calls.length && isAvailabilityQuestion(message) && !mentionsCatalogTerm(message, args.catalog)) {
    return { calls: [], reply: "unknown" };
  }

  // Bilgi: fiyatla aynı mesajda da sorulabilir ("Fiyat ve iptal koşulları?").
  if (!isFollowUp && !hasContactIntent(message) && (!hints.needsPriceTool || hints.needsFactTool)) {
    const pick = await pickFact(message, args.messageEmbedding, args.catalog);
    const accepted =
      pick &&
      (hints.needsFactTool
        ? pick.score >= FACT_MIN_SCORE_WITH_HINT
        : pick.score >= FACT_MIN_SCORE_WITHOUT_HINT ||
          (pick.score >= FACT_MIN_SCORE_WITH_TEXT_MATCH && pick.textHits > 0));
    if (accepted) calls.push({ toolName: "citeFact", input: { factId: pick.factId } });
  }
  return calls.length ? { calls } : none;
}

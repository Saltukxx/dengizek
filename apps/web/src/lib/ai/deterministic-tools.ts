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
import { normalizeText, stemMatch, suffixMatch, synonymsOf, tokens } from "@/lib/ai/text";
import { addDays, parseGuests, parseStayDates } from "@/lib/ai/stay-query";
import { asksAmenityPrice, asksKnownAmenity, canonicalAmenityText, matchAmenities, textsMentionAmenity } from "@/lib/ai/amenity-match";

export { extractStayDates } from "@/lib/ai/stay-query";

export { normalizeText };

/** Mesajdaki odayı oda adı / slug kelimeleriyle eşleştirir; belirsizse undefined. */
/**
 * Mesajda bir odanın TAM adı geçiyor mu ("1+0 Oda kaç kişilik?")? Birden çok
 * oda adı geçiyorsa en uzunu ("1+1 Oda (4 Kişilik)" ⊃ "1+1 Oda").
 */
export function roomNamedInMessage(message: string, rooms: Array<{ slug: string; name: string }>): string | undefined {
  const text = ` ${normalizeText(message)} `;
  const named = rooms
    .map((room) => ({ slug: room.slug, name: normalizeText(room.name) }))
    .filter((room) => room.name && text.includes(` ${room.name} `))
    .sort((a, b) => b.name.length - a.name.length);
  return named[0]?.slug;
}

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

export interface PriceMessageAnalysis {
  query: RoomPriceQuery;
  /** Mesajda açıkça geçen gece sayısı (tarihsiz takip sorusu için). */
  nights?: number;
  /** Tarihten söz ediliyor ama güvenle çözülemedi — misafire sorulur. */
  needsClarification: boolean;
}

/** Fiyat mesajını çözer: oda, tarih / ay, gece, kişi ve çocuklar. */
export function analyzePriceMessage(
  message: string,
  rooms: Array<{ slug: string; name: string }>,
  today: string,
): PriceMessageAnalysis {
  const query: RoomPriceQuery = {};
  const roomSlug = matchRoomSlug(message, rooms);
  if (roomSlug) query.roomSlug = roomSlug;

  const stay = parseStayDates(message, today);
  if (stay.checkIn && stay.checkOut && !stay.needsClarification) {
    query.checkIn = stay.checkIn;
    query.checkOut = stay.checkOut;
  } else if (stay.month) {
    query.month = stay.month;
  }

  const guests = parseGuests(message);
  if (guests.guestCount) query.guestCount = guests.guestCount;
  if (guests.childAges?.length) query.childAges = guests.childAges;
  if (guests.childCount) query.childCount = guests.childCount;

  return {
    query,
    ...(stay.nights ? { nights: stay.nights } : {}),
    needsClarification: stay.needsClarification,
  };
}

export function extractPriceQuery(
  message: string,
  rooms: Array<{ slug: string; name: string }>,
  today: string,
): RoomPriceQuery {
  return analyzePriceMessage(message, rooms, today).query;
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

/** fact-store factEmbeddingText ile aynı olmalı (DB'deki embedding'ler bu metinden). */
function factText(entry: AiFactCatalogEntry): string {
  return `${entry.hint}. ${entry.text}`;
}

/** Her soruda geçen, ayırt edici olmayan kelimeler — eşleşme puanı vermez. */
const LEXICAL_STOPWORDS = new Set([
  "otel", "otelin", "oteliniz", "otelde", "hotel", "the", "bilgi", "hakkinda", "nedir", "neler",
  "var", "misiniz", "musunuz", "verir", "kac", "nasil", "what", "your", "about", "does", "have",
  "sahibi", "notu", "ifadesi", "statement", "spec", "policy", "manual", "kadar",
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

function fallbackTerms(message: string): string[] {
  const terms = new Set<string>();
  for (const token of tokens(message)) {
    if (QUESTION_WORDS.has(token) || LEXICAL_STOPWORDS.has(token)) continue;
    const synonyms = synonymsOf(token);
    if (token.length >= 4 && !synonyms) terms.add(token);
    for (const synonym of synonyms ?? []) terms.add(synonym);
  }
  return [...terms];
}

/**
 * Embedding yokken puan: kartın ipucu/başlığı VE metni aranır (otel
 * ifadeleri yalnız metinleriyle bulunabilir). "37 km" mesafe sayılır.
 * Eşleşen terim başına 0.25 (en fazla 2); eşitlikte ipucu eşleşmesi ve
 * doğrulanmış bilgi öne geçer.
 */
function fallbackScore(message: string, entry: AiFactCatalogEntry): number {
  const head = tokens(`${entry.id.replace(/[._]/g, " ")} ${entry.hint} ${entry.title ?? ""}`).filter((t) => !LEXICAL_STOPWORDS.has(t));
  // "Havalimanı16 km": bitişik sayı ayrılır; "37 km" / "25 kilometre" mesafe sayılır.
  const text = canonicalAmenityText(
    entry.text
      .replace(/(\p{L})(\d)/gu, "$1 $2")
      .replace(/\d\s*(km|kilomet\w*)\b/giu, " mesafe ")
      .replace(/(\d)\s*°\s*C?\b/gu, "$1 derece "),
  );
  const body = tokens(text).filter((t) => t.length >= 4);
  const terms = fallbackTerms(canonicalAmenityText(message));
  let hits = 0;
  let headHits = 0;
  for (const term of terms) {
    const inHead = head.some((t) => suffixMatch(term, t));
    if (inHead || body.some((t) => suffixMatch(term, t))) hits += 1;
    if (inHead) headHits += 1;
  }
  // Terimler aynı satırda birlikte geçiyorsa öne geçer ("Havalimanı: 88 km").
  const lineHits = Math.max(
    0,
    ...text.split(/\n|(?<=[.!?])\s+/).map((line) => {
      const words = tokens(line);
      return terms.filter((term) => words.some((w) => suffixMatch(term, w))).length;
    }),
  );
  // Kabul eşiği 2 terimle ölçülür; fazladan eşleşen her terim ("termal havuz"
  // + "derece") daha özel parçayı öne geçirir.
  return (
    Math.min(hits, 2) * 0.25 +
    Math.max(0, hits - 2) * 0.05 +
    Math.min(headHits, 2) * 0.01 +
    Math.min(lineHits, 3) * 0.02 +
    (KIND_WEIGHT[entry.kind] ?? 0)
  );
}

const ATTRIBUTE_QUESTION =
  /\b(kac derece|derece|sicaklik|kacta|saat kac|saatleri|ne zaman|acik mi|nerede|nereye|ucret\w*|fiyat\w*|kac yas|derinlik|what time|when|hours|temperature|how warm|where|how much|cost)\b/;

export interface FactPick {
  factId: string;
  score: number;
  /** Mesajın konu kelimelerinden kaçı seçilen fact'in METNİNDE geçiyor. */
  textHits: number;
  /** Puan anlam benzerliğinden mi (true) yoksa yalnız kelime eşleşmesinden mi (false)? */
  semantic: boolean;
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
  /** Yayında kaydedilmiş embedding'ler (factId → vektör); yalnız eksikler embed edilir. */
  storedEmbeddings?: Map<string, number[]>,
): Promise<FactPick | null> {
  if (!catalog.length || !message.trim()) return null;
  const factEmbeddings = new Map<string, number[]>();
  if (messageEmbedding) {
    const missing = catalog.filter((entry) => !storedEmbeddings?.has(entry.id));
    const fresh = missing.length
      ? await embedCached(missing.map((entry) => ({ id: entry.id, text: factText(entry) })))
      : new Map<string, number[]>();
    for (const entry of catalog) {
      const embedding = storedEmbeddings?.get(entry.id) ?? fresh.get(entry.id);
      if (embedding) factEmbeddings.set(entry.id, embedding);
    }
  }

  // Embedding servisi kısmen başarısız olduysa ölçekler karışmasın: ya hepsi
  // anlam + kelime puanıyla ya hepsi yalnız kelime puanıyla değerlendirilir.
  const semanticMode = Boolean(messageEmbedding) && catalog.every((e) => factEmbeddings.has(e.id));

  // Olanak listesi yalnız "var mı?" sorusunu cevaplar; saat, derece, yer, ücret
  // sorularında aday değildir ("Termal havuz kaç derece?" → havuz metni).
  const asksAttribute = ATTRIBUTE_QUESTION.test(normalizeText(message));

  let best: FactPick | null = null;
  for (const entry of catalog) {
    if (asksAttribute && entry.id === "spec.amenities") continue;
    const lexical = lexicalScore(message, entry);
    const embedding = factEmbeddings.get(entry.id);
    // Embedding yoksa: 2 terim eşleşmesi gerekir (tek terim eşiği geçmez).
    const score =
      semanticMode && embedding && messageEmbedding
        ? cosineSimilarity(messageEmbedding, embedding) + lexical * 0.1 + KIND_WEIGHT[entry.kind]
        : fallbackScore(message, entry);
    if (!best || score > best.score) best = { factId: entry.id, score, textHits: 0, semantic: semanticMode };
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

export type ServerReply = "unknown" | "contact" | "askDates" | "rooms";

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
  /** "X var mı?" sorusunda olanak listesinde bulunan olanaklar — sunucu "Evet, X var" der. */
  amenities?: string[];
  /** Olanağın ücretli/ücretsiz olduğu da soruldu (liste bunu söylemez). */
  amenityPriceAsked?: boolean;
  /** reply "rooms": otelin oda tipleri (oda kartlarının metni) — sunucu listeler. */
  rooms?: string[];
  /**
   * unknown: katalog dışı konu · contact: iletişim bilgisi isteği (verilmez) ·
   * askDates: fiyat istendi ama tarih belirsiz — tarih sorulur.
   */
  reply?: ServerReply;
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
  return Boolean(
    query.checkIn || query.month || query.guestCount || query.childAges?.length || query.childCount || query.roomSlug,
  );
}

/**
 * Fiyat sorgusunu sohbet bağlamıyla tamamlar: tarih/kişi sayısı aynı
 * yolculuk için taşınır; oda yalnızca mesaj odayı belirtmiyorsa ve takip
 * sorusu ya da tekil gönderme ("odanın fiyatı") varsa taşınır.
 * `nights`: tarihsiz gece sayısı ("Peki 5 gece olursa?") — önceki girişe uygulanır.
 */
export function mergePriceQuery(
  message: string,
  current: RoomPriceQuery,
  context: ConversationContext,
  rooms: Array<{ slug: string; name: string }>,
  isFollowUp: boolean,
  nights?: number,
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

  if (current.checkIn && current.checkOut) {
    merged.checkIn = current.checkIn;
    merged.checkOut = current.checkOut;
  } else if (current.month) {
    merged.month = current.month;
  } else if (nights && previous.checkIn) {
    merged.checkIn = previous.checkIn;
    merged.checkOut = addDays(previous.checkIn, nights);
  } else if (previous.checkIn && previous.checkOut) {
    merged.checkIn = previous.checkIn;
    merged.checkOut = previous.checkOut;
  } else if (previous.month) {
    merged.month = previous.month;
  }

  const guestCount = current.guestCount ?? previous.guestCount;
  if (guestCount) merged.guestCount = guestCount;
  const childAges = current.childAges ?? (current.childCount ? undefined : previous.childAges);
  if (childAges?.length) merged.childAges = childAges;
  const childCount = current.childCount ?? previous.childCount;
  if (childCount) merged.childCount = Math.max(childCount, childAges?.length ?? 0);
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

/**
 * "Hangi odalarınız var?", "Oda tipleriniz neler?", "What rooms do you have?"
 * — tek bir odanın özelliği değil, oda listesi soruluyor.
 */
const ROOM_LIST_PATTERNS = [
  /\b(hangi|ne tur|ne cesit|kac cesit|kac tip|kac farkli)\b.{0,20}\boda/,
  /\boda (tip|cesit|tur|secenek|cinsi)/,
  // "Odalarınızı anlatır mısınız?" — "Odalarınızda klima var mı?" (olanak sorusu) değil.
  /\bodalar(iniz|inizi)?( hakkinda)? (neler|nedir|nelerdir|nasil|anlat|goster|listele)/,
  /\b(what|which)\b.{0,20}\brooms?\b/,
  /\b(room types?|types of rooms?|room options)\b/,
  /\brooms? do you (have|offer)\b/,
];

export function isRoomListQuestion(message: string): boolean {
  const text = normalizeText(message);
  return ROOM_LIST_PATTERNS.some((re) => re.test(text));
}

export function isAvailabilityQuestion(message: string): boolean {
  return AVAILABILITY_QUESTION.test(normalizeText(message));
}


/**
 * Otelin verisinde HİÇ geçmeyen bilinen konular (giriş/çıkış saati, evcil
 * hayvan). Model bu durumda alakasız bir kartı "aşağıda görebilirsiniz" diye
 * gösteriyordu; sunucu doğrudan "bilgim yok" der. Bilgi otel metinlerinde
 * geçiyorsa (ör. "Giriş saati 14:00") kart seçimi normal çalışır.
 */
const KNOWN_TOPICS: Array<{ ask: (text: string) => boolean; evidence: RegExp }> = [
  {
    ask: (t) => /\b(giris|checkin|arrival)/.test(t) && /\b(saat|kacta|time|when)/.test(t),
    evidence: /(giri[şs]|check[\s-]?in|c\/in)[\s\S]{0,60}?\d{1,2}[:.]\d{2}/i,
  },
  {
    ask: (t) => (/\b(cikis|cikmam|checkout|ayrilis)/.test(t) && /\b(saat|kacta|time|when)/.test(t)) || /\ben gec kacta\b/.test(t),
    evidence: /(çıkı[şs]|cikis|check[\s-]?out|c\/out|ayrılış)[\s\S]{0,60}?\d{1,2}[:.]\d{2}/i,
  },
  {
    ask: (t) => /\b(evcil|kopek|kopeg|kedi)|\b(pets?|dogs?|cats?)\b/.test(t),
    evidence: /evcil|hayvan|\bpets?\b/i,
  },
];

export function isMissingKnownTopic(message: string, catalog: AiFactCatalogEntry[]): boolean {
  const text = normalizeText(message);
  const topic = KNOWN_TOPICS.find((t) => t.ask(text));
  if (!topic) return false;
  return !catalog.some((entry) => topic.evidence.test(`${entry.title ?? ""} ${entry.text}`));
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
  /** Yayında kaydedilmiş fact embedding'leri (bkz. loadFactEmbeddings). */
  storedFactEmbeddings?: Map<string, number[]>;
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
  const analysis = analyzePriceMessage(message, args.rooms, args.today);
  const priceDetails = analysis.query;
  const isFollowUp =
    !hints.needsPriceTool &&
    !hints.needsFactTool &&
    Boolean(context.lastPriceQuery) &&
    (hasStayDetails(priceDetails) || Boolean(analysis.nights) || analysis.needsClarification);
  let askDates = false;
  if (hints.needsPriceTool || isFollowUp) {
    const input = mergePriceQuery(message, priceDetails, context, args.rooms, isFollowUp, analysis.nights);
    // Tarihten söz edilmiş ama güvenle çözülememişse ya da gece sayısı var
    // ama giriş tarihi yoksa: yanlış (ya da bugünün) fiyatını göstermek
    // yerine misafire tarih sorulur.
    askDates = analysis.needsClarification || (Boolean(analysis.nights) && !input.checkIn && !input.month);
    if (!askDates) calls.push({ toolName: "getRoomPrice", input });
  }
  const priceWanted = hints.needsPriceTool || isFollowUp;

  // İletişim bilgisi istenirse: rehber vermez, talep formuna yönlendirir.
  if (!calls.length && !askDates && hasContactIntent(message)) return { calls: [], reply: "contact" };

  if (!calls.length && !askDates && !priceWanted) {
    // Oda listesi: olanak kartı ya da tek bir oda değil, tüm oda tipleri.
    if (isRoomListQuestion(message)) {
      const rooms = args.catalog.filter((e) => /^room\.[^.]+\.info$/.test(e.id)).map((e) => e.text);
      return rooms.length ? { calls: [], reply: "rooms", rooms } : { calls: [], reply: "unknown" };
    }
    // Olanak sorusu: listede varsa "Evet, tesiste X var" + yalnız o olanakların
    // kartı. Bilinen bir olanak (spor salonu, havuz…) ne listede ne otelin
    // metinlerinde geçiyorsa "bilgim yok" — model "evet" uyduramaz.
    if (isAvailabilityQuestion(message)) {
      const amenitiesEntry = args.catalog.find((e) => e.id === "spec.amenities");
      const matches = matchAmenities(message, amenitiesEntry?.items ?? []);
      if (matches.length) {
        return {
          calls: [{ toolName: "citeFact", input: { factId: "spec.amenities" } }],
          amenities: matches,
          ...(asksAmenityPrice(message) ? { amenityPriceAsked: true } : {}),
        };
      }
      const otherTexts = args.catalog.filter((e) => e.id !== "spec.amenities").map((e) => `${e.title ?? ""} ${e.text}`);
      if (asksKnownAmenity(message) && !textsMentionAmenity(message, otherTexts)) return { calls: [], reply: "unknown" };
    }
    // Giriş saati / evcil hayvan gibi bilinen bir konu otelin verisinde hiç yok.
    if (isMissingKnownTopic(message, args.catalog)) return { calls: [], reply: "unknown" };
  }

  // Katalogda karşılığı olmayan "… var mı?" sorusu: kart aranmaz, model de
  // "evet" uyduramaz.
  if (!calls.length && !askDates && !priceWanted && isAvailabilityQuestion(message) && !mentionsCatalogTerm(message, args.catalog)) {
    return { calls: [], reply: "unknown" };
  }

  // Bilgi: fiyatla aynı mesajda da sorulabilir ("Fiyat ve iptal koşulları?").
  if (!isFollowUp && !hasContactIntent(message) && (!priceWanted || hints.needsFactTool)) {
    const pick = await pickFact(message, args.messageEmbedding, args.catalog, args.storedFactEmbeddings);
    // Kelime eşleşmesi modunda (embedding yok) puan ölçeği farklı: iki konu
    // terimi eşleşmesi (≥0.45) + ipucu ya da terimin kart metninde geçmesi.
    const accepted =
      pick &&
      (!pick.semantic
        ? pick.score >= FACT_MIN_SCORE_WITH_HINT && (hints.needsFactTool || pick.textHits > 0)
        : hints.needsFactTool
          ? pick.score >= FACT_MIN_SCORE_WITH_HINT
          : pick.score >= FACT_MIN_SCORE_WITHOUT_HINT ||
            (pick.score >= FACT_MIN_SCORE_WITH_TEXT_MATCH && pick.textHits > 0));
    if (accepted) {
      // Oda kartı seçildi ama mesajda başka bir odanın tam adı geçiyor: o oda.
      const named = pick.factId.startsWith("room.") ? roomNamedInMessage(message, args.rooms) : undefined;
      const namedFact = named && args.catalog.find((e) => e.id === `room.${named}.info`);
      calls.push({ toolName: "citeFact", input: { factId: namedFact && !pick.factId.startsWith(`room.${named}.`) ? namedFact.id : pick.factId } });
    }
  }
  if (askDates) return { calls, reply: "askDates" };
  return calls.length ? { calls } : none;
}

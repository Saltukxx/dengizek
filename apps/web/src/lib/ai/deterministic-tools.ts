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
import { normalizeText, stemMatch, tokens } from "@/lib/ai/text";
import { addDays, parseGuests, parseStayDates } from "@/lib/ai/stay-query";

export { extractStayDates } from "@/lib/ai/stay-query";

export { normalizeText };

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

export type ServerReply = "unknown" | "contact" | "askDates";

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

  // Katalogda karşılığı olmayan "… var mı?" sorusu: kart aranmaz, model de
  // "evet" uyduramaz.
  if (!calls.length && !askDates && !priceWanted && isAvailabilityQuestion(message) && !mentionsCatalogTerm(message, args.catalog)) {
    return { calls: [], reply: "unknown" };
  }

  // Bilgi: fiyatla aynı mesajda da sorulabilir ("Fiyat ve iptal koşulları?").
  if (!isFollowUp && !hasContactIntent(message) && (!priceWanted || hints.needsFactTool)) {
    const pick = await pickFact(message, args.messageEmbedding, args.catalog);
    const accepted =
      pick &&
      (hints.needsFactTool
        ? pick.score >= FACT_MIN_SCORE_WITH_HINT
        : pick.score >= FACT_MIN_SCORE_WITHOUT_HINT ||
          (pick.score >= FACT_MIN_SCORE_WITH_TEXT_MATCH && pick.textHits > 0));
    if (accepted) calls.push({ toolName: "citeFact", input: { factId: pick.factId } });
  }
  if (askDates) return { calls, reply: "askDates" };
  return calls.length ? { calls } : none;
}

// ---------------------------------------------------------------------------
// AI yanıt guard — serbest metinde fiyat/rakam engeli
// ---------------------------------------------------------------------------

import type { TextStreamPart, ToolSet } from "ai";
import type { AiPriceErrorCode, AiPriceQueryEcho, AiPriceQueryResult } from "@/lib/ai/types";

// Her kalıp en az bir RAKAM ister: "[\d.,]+" tek başına "." ile eşleşip
// ". Gece kayağı" gibi düz cümleleri fiyat sanıyordu.
//
// Para birimi / yüzde kalıpları HER ZAMAN uygulanır: fiyat aracı çağrılmış
// olsa bile modelin serbest metinde tutar ya da indirim yazması kartla
// çelişebilir (yanlış toplam, uydurma yüzde). Doğru tutar yalnız karttadır.
const CURRENCY_PATTERNS = [
  /₺\s*\d/,
  /\d[\d.,]*\s*₺/,
  /\$\s*\d/,
  /\d[\d.,]*\s*\$/,
  /€\s*\d/,
  /\d[\d.,]*\s*€/,
  /£\s*\d/,
  /\d[\d.,]*\s*(TL|tl|TRY|try|lira|Lira|USD|usd|EUR|eur|euro|Euro|dolar|Dolar|dollars?|Dollars?)\b/,
  /(?:^|\s)%\s*\d/,
  /\d\s*%/,
  /\byüzde\s*\d/i,
];
// Sayı + gece/kişi: fiyat aracı çağrılmadıysa uydurma konaklama ayrıntısı.
const COUNT_PATTERNS = [/\b\d[\d.,]*\s*(gece|kişi|kisi)\b/i];

export const GUARD_FALLBACK_MESSAGE =
  "Güncel bilgiyi kartta göstermek için lütfen tekrar sorun; size doğru veriyi göstereyim.";

export function textContainsPriceLikeContent(text: string, opts: { hadPriceTool?: boolean } = {}): boolean {
  if (CURRENCY_PATTERNS.some((re) => re.test(text))) return true;
  return !opts.hadPriceTool && COUNT_PATTERNS.some((re) => re.test(text));
}

// ---------------------------------------------------------------------------
// Fiyat / bilgi niyeti — normalize edilmiş metinde KELİME SINIRIYLA aranır.
// Alt dize araması "otel"de "tl", "coffee"de "fee", "separate"te "rate"
// buluyordu; "Plaja ne kadar uzak?" fiyat kartı açıyordu.
// ---------------------------------------------------------------------------

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i")
    .replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u").replace(/â/g, "a")
    .replace(/check[\s_-]?in/g, "checkin")
    .replace(/check[\s_-]?out/g, "checkout")
    .replace(/[^a-z0-9\s₺$€£%]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PRICE_PATTERNS_INTENT = [
  // TR
  /\bfiyat/, /\bucret(?!siz|li\b|li mi)/, /\bkac para\b/, /\bkaca\b/, /\bkac (?:tl|lira|euro|dolar)\b/,
  /\bgecelik\b/, /\bgecesi (?:kac|ne kadar)\b/, /\btutar/, /\bmaliyet/, /\bpahali/, /\bucuz/,
  /\bbutce/, /\bindirim/, /\bkampanya/, /\berken rezervasyon/, /\bteklif/,
  // EN
  /\bprices?\b/, /\bpricing\b/, /\bcosts?\b/, /\bcosting\b/, /\brates?\b/, /\bper night\b/, /\bnightly\b/,
  /\bfees?\b/, /\bcharges?\b/, /\bexpensive\b/, /\bcheap/, /\bbudget\b/, /\bdiscounts?\b/, /\bdeals?\b/,
  /\bquote\b/, /\btariff/, /\bhow much\b(?! (?:time|longer))/,
  // Para birimi
  /₺|\$|€|£/, /\b(?:tl|try|lira|euro|eur|usd|dolar|dollars?)\b/,
];

/** "ne kadar" mesafe/süre/boyut sorusundaysa fiyat değildir ("Plaja ne kadar uzak?"). */
const NE_KADAR = /\bne kadar\b/;
const NON_PRICE_NE_KADAR =
  /\b(uzak\w*|yakin\w*|mesafe\w*|sur\w*|zaman|vakit|dakika\w*|saat\w*|km|metre\w*|buyuk\w*|genis\w*|derin\w*|sicak\w*|soguk\w*|kalabalik\w*|kalabil\w*|erken|gec\b|bekle\w*|yuru\w*)\b/;

/** Olanak adı geçen fiyat sorusu oda fiyatı değil, bilgi sorusudur ("Otopark ücretli mi?"). */
const AMENITY_WORDS =
  /\b(otopark\w*|park\w*|kahvalti\w*|breakfast|spa|havuz\w*|pool|wifi|wi fi|internet|minibar|transfer\w*|sezlong\w*|plaj\w*|beach|sauna|hamam\w*|masaj\w*|massage|restoran\w*|restaurant|aksam yemeg\w*|dinner|ogle\w*|lunch|cocuk kulub\w*|kids club|shuttle|servis)\b/;

const FACT_PATTERNS_INTENT = [
  // TR
  /\biptal/, /\bevcil/, /\bcheckin/, /\bcheckout/, /\bpolitika/, /\bolanak/, /\brestoran/,
  /\boda tip/, /\boda ozellik/, /\bkapasite/, /\badres/, /\bkope/, /\bkedi/,
  // "telefon/phone/contact" bilerek yok: rehber iletişim bilgisi vermez ve
  // telefon kataloğa girmez; zorlanırsa model alakasız bir kart seçer.
  // EN
  /\bcancel/, /\brefund/, /\bpets?\b/, /\bpolic(?:y|ies)\b/, /\bamenit/, /\bfacilit/, /\brestaurants?\b/,
  /\bbreakfast\b/, /\bcapacity\b/, /\baddress\b/, /\bdogs?\b/, /\bcats?\b/, /\bwifi\b/, /\bparking\b/,
];

export interface ToolHints {
  needsPriceTool: boolean;
  needsFactTool: boolean;
}

/** "oda/room" + politika-benzeri sözcük → fact sorusu (TR ve EN). */
function mentionsRoomFact(text: string): boolean {
  if (!/\b(oda\w*|rooms?)\b/.test(text)) return false;
  return /\b(politika\w*|iptal\w*|ozellik\w*|tipi\w*|kapasite\w*|policy|cancel\w*|features?|types?|capacity|size)\b/.test(text);
}

export function detectToolHints(userMessage: string): ToolHints {
  const text = normalize(userMessage);
  let needsPriceTool = PRICE_PATTERNS_INTENT.some((re) => re.test(text));
  if (!needsPriceTool && NE_KADAR.test(text) && !NON_PRICE_NE_KADAR.test(text)) needsPriceTool = true;
  let needsFactTool = FACT_PATTERNS_INTENT.some((re) => re.test(text)) || mentionsRoomFact(text);

  // "Kahvaltı fiyata dahil mi?", "Otopark ücretli mi?", "Spa fiyatları?" —
  // oda/konaklama sözü yoksa bu bir olanak sorusudur, oda fiyatı değil.
  const staysTalk =
    /\d/.test(text) ||
    /\b(gece\w*|nights?|konaklama\w*|stay\w*|kisi\w*|people|guests?|oda\w*|rooms?|suit\w*|suite|hafta ?sonu\w*|weekend|yarin\w*|bugun\w*|tomorrow|tonight|today|tarih\w*|dates?)\b/.test(text);
  const amenityPriceTalk = /\b(ucret\w*|fiyat\w*|fees?|charge\w*|costs?|prices?|dahil\w*|included|free|bedava|paid|extra|ekstra)\b/.test(text);
  if (AMENITY_WORDS.test(text) && amenityPriceTalk && !staysTalk) {
    needsPriceTool = false;
    needsFactTool = true;
  }
  return { needsPriceTool, needsFactTool };
}

export function buildToolHintPrompt(hints: ToolHints): string {
  const parts: string[] = [];
  if (hints.needsPriceTool) parts.push("Bu mesajda MUTLAKA getRoomPrice aracını kullan.");
  if (hints.needsFactTool) parts.push("Bu mesajda MUTLAKA citeFact aracını kullan.");
  return parts.join(" ");
}

export type GuardFlags = { hadPriceTool: boolean; hadFactTool: boolean };

/**
 * Bir adımda hangi tool'un ZORLA çağrılacağına karar verir (streamText'in
 * prepareStep'ine bağlanır — bkz. chat/route.ts). Fiyat ve fact ipucu aynı
 * anda gelirse fiyat önceliklidir: serbest metinde rakam üretmek daha yüksek
 * riskli bir hallucination sınıfı. Bir adımda yalnızca TEK tool zorlanabilir
 * (zorunlu araç seçimi tek fonksiyon seçer; bazı sağlayıcılar bunu uygulamaz —
 * asıl güvence sunucu tarafı araç çalıştırmadır, bkz. deterministic-tools.ts) — model aynı turda
 * ikinci bir tool'u da çağırmak isterse bunu yapamaz; kullanıcı gerekirse
 * ikinci soruyu ayrı bir mesajda tekrar sorar.
 */
export function decideToolChoice(
  hints: ToolHints,
  toolFlags: GuardFlags,
): { type: "tool"; toolName: "getRoomPrice" | "citeFact" } | undefined {
  if (hints.needsPriceTool && !toolFlags.hadPriceTool) {
    return { type: "tool", toolName: "getRoomPrice" };
  }
  if (hints.needsFactTool && !toolFlags.hadFactTool) {
    return { type: "tool", toolName: "citeFact" };
  }
  return undefined;
}

const GUARD_WINDOW_CHARS = 120; // en uzun gerçekçi fiyat pattern'inden büyük tampon

/**
 * Stream transform: metni GERÇEK ZAMANLI akıtır (token-bazlı UX korunur),
 * yalnızca son ~120 karakterlik kayan pencerede fiyat-benzeri içerik
 * ara — forced tool-choice (decideToolChoice) sayesinde bu artık ikincil bir
 * güvenlik ağı, birincil savunma değil. Tetiklenirse: o metin bloğunun
 * KALANI akıtılmaz (zaten akıtılmış önceki karakterler geri çekilemez —
 * bu bilinçli bir tradeoff, ayrıntı için plan Faz 2.1'e bakın) ve kısa bir
 * kapanış notu eklenir.
 */
export function createGuardStreamTransform<TOOLS extends ToolSet>(
  flags: GuardFlags,
  onGuardTriggered?: (info: { originalLength: number }) => void,
) {
  return () => {
    let recentText = "";
    let blockLength = 0;
    let suppressing = false;

    const transform = new TransformStream<TextStreamPart<ToolSet>, TextStreamPart<ToolSet>>({
      transform(chunk, controller) {
        if (chunk.type === "text-start") {
          recentText = "";
          blockLength = 0;
          suppressing = false;
          controller.enqueue(chunk);
          return;
        }
        if (chunk.type === "text-delta") {
          if (suppressing) return;
          blockLength += chunk.text.length;
          recentText = (recentText + chunk.text).slice(-GUARD_WINDOW_CHARS);
          if (textContainsPriceLikeContent(recentText, { hadPriceTool: flags.hadPriceTool })) {
            suppressing = true;
            onGuardTriggered?.({ originalLength: blockLength });
            controller.enqueue({ type: "text-delta", id: chunk.id, text: ` ${GUARD_FALLBACK_MESSAGE}` });
            return;
          }
          controller.enqueue(chunk);
          return;
        }
        controller.enqueue(chunk);
      },
    });
    return transform as unknown as TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>;
  };
}

// ---------------------------------------------------------------------------
// Sunucu aracı turları — sabit, otel verisinden üretilen metinler.
// ---------------------------------------------------------------------------

export type ServerToolName = "navigateTo" | "getRoomPrice" | "citeFact" | "openInquiry";

const SERVER_TOOL_FALLBACK: Record<ServerToolName, { tr: string; en: string }> = {
  navigateTo: {
    tr: "Hemen oraya geçiyoruz.",
    en: "Let's head there now.",
  },
  getRoomPrice: {
    tr: "Güncel fiyatları kartta görebilirsiniz; farklı tarih veya kişi sayısı için sormanız yeterli.",
    en: "You can see the current prices on the card; just ask for other dates or guest counts.",
  },
  citeFact: {
    tr: "Bilgiyi sizin için kartta paylaştım.",
    en: "I've shared the details on the card for you.",
  },
  openInquiry: {
    tr: "Talep formunu sizin için açtım.",
    en: "I've opened the request form for you.",
  },
};

export function serverToolFallbackText(toolName: ServerToolName, language: string | undefined): string {
  const texts = SERVER_TOOL_FALLBACK[toolName];
  return language && language !== "tr" ? texts.en : texts.tr;
}

/**
 * Kart turları (fiyat / bilgi / talep) için modelsiz çerçeve cümlesi. Kart
 * bilgiyi zaten gösterir; model bu cümlede bilgi uydurabildiği (ör.
 * "evcil hayvan kabul edilmez" kartının yanına "özel odalarımız var") ve
 * dili karıştırabildiği için bu turlarda model hiç çağrılmaz.
 */
export function serverToolCardText(
  toolName: Exclude<ServerToolName, "navigateTo">,
  language: string | undefined,
  output: unknown,
): string {
  const en = Boolean(language && language !== "tr");
  const result = (output ?? {}) as { ok?: boolean; blocked?: boolean; error?: string };

  if (toolName === "getRoomPrice") return priceTurnText(output as AiPriceQueryResult | null, en);
  if (toolName === "citeFact" && result.ok === false) {
    return en
      ? "I don't have verified information on that, but I can ask the hotel for you."
      : "Bu konuda doğrulanmış bir bilgim yok; otelden sizin için bilgi alabilirim.";
  }
  if (toolName === "openInquiry" && result.ok === false) {
    return en
      ? "Let's explore the tour a little more first; then I can open the request form."
      : "Turu biraz daha gezelim; ardından talep formunu açabilirim.";
  }
  return serverToolFallbackText(toolName, language);
}

// ---------------------------------------------------------------------------
// Fiyat turu metni — misafire anlaşılan sorgu AÇIKÇA geri söylenir
// ("10–13 Ağustos 2027, 3 gece, 2 kişi"). Yanlış çıkarılmış bir tarih ya da
// kişi sayısı böylece kartı okumadan da fark edilir.
// ---------------------------------------------------------------------------

const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function dateParts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y!, m!, d!];
}

function rangeText(checkIn: string, checkOut: string, en: boolean): string {
  const [y1, m1, d1] = dateParts(checkIn);
  const [y2, m2, d2] = dateParts(checkOut);
  const months = en ? MONTHS_EN : MONTHS_TR;
  if (en) {
    if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${months[m1 - 1]} ${y1}`;
    if (y1 === y2) return `${d1} ${months[m1 - 1]} – ${d2} ${months[m2 - 1]} ${y1}`;
    return `${d1} ${months[m1 - 1]} ${y1} – ${d2} ${months[m2 - 1]} ${y2}`;
  }
  if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${months[m1 - 1]} ${y1}`;
  if (y1 === y2) return `${d1} ${months[m1 - 1]} – ${d2} ${months[m2 - 1]} ${y1}`;
  return `${d1} ${months[m1 - 1]} ${y1} – ${d2} ${months[m2 - 1]} ${y2}`;
}

function guestsText(q: AiPriceQueryEcho, en: boolean): string | null {
  const parts: string[] = [];
  const children = Math.max(q.childCount ?? 0, q.childAges?.length ?? 0);
  if (q.guestCount) {
    parts.push(en ? `${q.guestCount} ${children ? "adult" : "guest"}${q.guestCount > 1 ? "s" : ""}` : `${q.guestCount} ${children ? "yetişkin" : "kişi"}`);
  }
  if (children) {
    const ages = q.childAges?.length ? ` (${q.childAges.join(", ")} ${en ? "yrs" : "yaş"})` : "";
    parts.push(en ? `${children} child${children > 1 ? "ren" : ""}${ages}` : `${children} çocuk${ages}`);
  }
  if (!parts.length) return null;
  return parts.join(en ? " and " : " ve ");
}

function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000);
}

const PRICE_ERROR_EN: Record<AiPriceErrorCode, string> = {
  no_rooms: "There are no rooms on sale at the moment.",
  room_not_found: "I couldn't find that room.",
  invalid_dates: "Those dates don't look valid — check-out must be after check-in.",
  past_date: "That date is already in the past.",
  too_far: "The hotel may not have published prices that far ahead yet; it's best to confirm with the hotel.",
  too_long: "For stays longer than 30 nights the hotel sets the price individually.",
};

function priceTurnText(result: AiPriceQueryResult | null, en: boolean): string {
  if (!result || result.ok === false) {
    const code = result?.errorCode;
    if (en) {
      return `${code ? `${PRICE_ERROR_EN[code]} ` : ""}You can ask again with different dates or another room.`;
    }
    return `${result?.error ? `${result.error} ` : ""}Tarihleri veya odayı değiştirerek tekrar sorabilirsiniz.`;
  }
  const q = result.query ?? {};
  const guests = guestsText(q, en);
  let period: string;
  let tail: string;
  if (q.checkIn && q.checkOut) {
    const nights = nightsBetween(q.checkIn, q.checkOut);
    period = en
      ? `${rangeText(q.checkIn, q.checkOut, true)} (${nights} night${nights > 1 ? "s" : ""})`
      : `${rangeText(q.checkIn, q.checkOut, false)} (${nights} gece)`;
    tail = en ? "Let me know if the dates or guests are different." : "Tarih ya da kişi sayısı farklıysa yazmanız yeterli.";
  } else if (q.month) {
    const [y, m] = q.month.split("-").map(Number);
    period = en ? `${MONTHS_EN[m! - 1]} ${y} (nightly range)` : `${MONTHS_TR[m! - 1]} ${y} (gecelik aralık)`;
    tail = en ? "Tell me your exact dates and I'll calculate the total." : "Giriş-çıkış tarihlerini yazarsanız toplamı hesaplayayım.";
  } else {
    period = en ? "tonight's nightly rate" : "bugünkü gecelik fiyat";
    tail = en ? "Tell me your dates for an exact total." : "Belirli tarihler için giriş-çıkış tarihlerini yazabilirsiniz.";
  }
  const subject = guests ? (en ? `${period}, ${guests}` : `${period}, ${guests}`) : period;
  const missingAges = Math.max(q.childCount ?? 0, q.childAges?.length ?? 0) - (q.childAges?.length ?? 0);
  const ageNote =
    missingAges > 0
      ? en
        ? " Child rates depend on age — tell me the children's ages and I'll add them."
        : " Çocuk ücreti yaşa göre değişiyor; çocukların yaşlarını yazarsanız ekleyeyim."
      : "";
  return en
    ? `Prices for ${subject} are on the card. ${tail}${ageNote}`
    : `${subject.charAt(0).toLocaleUpperCase("tr-TR")}${subject.slice(1)} için fiyatlar kartta. ${tail}${ageNote}`;
}

const ASK_DATES_TEXT = {
  tr: "Fiyatı doğru hesaplayabilmem için giriş ve çıkış tarihlerinizi yazar mısınız? Örneğin “10–13 Ağustos” ya da “15 Temmuz'dan itibaren 3 gece”.",
  en: "To quote the right price, could you tell me your check-in and check-out dates? For example “10–13 August” or “3 nights from 15 July”.",
};

const CONTACT_TEXT = {
  tr: "Otelin iletişim bilgilerini paylaşamıyorum. Sorunuzu ya da rezervasyon isteğinizi talep formuyla otele iletebilirsiniz.",
  en: "I can't share the hotel's contact details, but you can send your question or booking request to the hotel through the request form.",
};

/** Gezinme turu: adımın adı + otelin kendi yazdığı açıklamanın ilk cümlesi (modelsiz). */
function navigationText(output: unknown, en: boolean): string {
  const step = (output ?? {}) as { title?: string; description?: string };
  if (!step.title) return en ? SERVER_TOOL_FALLBACK.navigateTo.en : SERVER_TOOL_FALLBACK.navigateTo.tr;
  if (en) return `Taking you to “${step.title}” now.`;
  const firstSentence = step.description?.split(/(?<=[.!?])\s/)[0]?.trim();
  const intro = `Hemen “${step.title}” bölümüne geçiyoruz.`;
  return firstSentence && firstSentence.length <= 180 ? `${intro} ${firstSentence}` : intro;
}

const UNKNOWN_TEXT = {
  tr: "Bu konuda doğrulanmış bir bilgim yok. İsterseniz talep formuyla otele sorabilirsiniz.",
  en: "I don't have verified information about that. You can ask the hotel through the request form.",
};

const MULTI_CARD_TEXT = {
  tr: "Fiyatları ve istediğiniz bilgiyi kartlarda paylaştım.",
  en: "I've shared the prices and the details on the cards.",
};

/**
 * Sunucu turunun sabit metni — sunucu turlarında model hiç konuşmaz.
 * Testlerde model, kartın ya da gidilen alanın yanına bilgi uydurdu
 * ("jakuzili suit", "evcil hayvanlar için özel odalar"); bu metinler yalnız
 * otelin kendi verisinden üretilir. null → sunucu turu değil, model konuşur.
 */
export function serverTurnText(
  turn: { runs: Array<{ toolName: ServerToolName; output: unknown }>; reply?: "unknown" | "contact" | "askDates" },
  language: string | undefined,
): string | null {
  const en = Boolean(language && language !== "tr");
  if (!turn.runs.length) {
    if (turn.reply === "unknown") return en ? UNKNOWN_TEXT.en : UNKNOWN_TEXT.tr;
    if (turn.reply === "contact") return en ? CONTACT_TEXT.en : CONTACT_TEXT.tr;
    if (turn.reply === "askDates") return en ? ASK_DATES_TEXT.en : ASK_DATES_TEXT.tr;
    return null;
  }
  if (turn.reply === "askDates") {
    // Bilgi kartı gösterildi, fiyat için tarih soruluyor.
    const cardText = serverTurnText({ runs: turn.runs }, language);
    return `${cardText ?? ""} ${en ? ASK_DATES_TEXT.en : ASK_DATES_TEXT.tr}`.trim();
  }
  const navigation = turn.runs.find((run) => run.toolName === "navigateTo");
  if (navigation) return navigationText(navigation.output, en);

  const failed = turn.runs.find((run) => (run.output as { ok?: boolean } | null)?.ok === false);
  if (turn.runs.length === 1 || failed) {
    const run = failed ?? turn.runs[0]!;
    return serverToolCardText(run.toolName as Exclude<ServerToolName, "navigateTo">, language, run.output);
  }
  return en ? MULTI_CARD_TEXT.en : MULTI_CARD_TEXT.tr;
}

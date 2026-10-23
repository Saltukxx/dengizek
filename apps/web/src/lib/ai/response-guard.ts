// ---------------------------------------------------------------------------
// AI yanıt guard — serbest metinde fiyat/rakam engeli
// ---------------------------------------------------------------------------

import type { TextStreamPart, ToolSet } from "ai";

// Her kalıp en az bir RAKAM ister: "[\d.,]+" tek başına "." ile eşleşip
// ". Gece kayağı" gibi düz cümleleri fiyat sanıyordu.
const PRICE_PATTERNS = [
  /₺\s*\d/,
  /\d[\d.,]*\s*₺/,
  /\$\s*\d/,
  /\d[\d.,]*\s*\$/,
  /€\s*\d/,
  /\d[\d.,]*\s*€/,
  /\d[\d.,]*\s*(TL|tl|TRY|try)\b/,
  /\b\d[\d.,]*\s*(gece|kişi|kisi)\b/i,
];

export const GUARD_FALLBACK_MESSAGE =
  "Güncel bilgiyi kartta göstermek için lütfen tekrar sorun; size doğru veriyi göstereyim.";

export function textContainsPriceLikeContent(text: string): boolean {
  return PRICE_PATTERNS.some((re) => re.test(text));
}

// Anahtar kelimeler TR + EN: motor İngilizce yanıt verebiliyor
// (bkz. language-detect), dolayısıyla araç yönlendirmesi de İngilizce
// sorularda çalışmalı. Aksi halde EN misafirde tool zorlanmaz, model serbest
// metinde rakam yazar ve aşağıdaki guard mesajı ortasından keser.
const PRICE_KEYWORDS = [
  // TR
  "fiyat", "kaç para", "gecelik", "ne kadar", "ücret", "ucret", "tl", "€", "$",
  // EN
  "price", "cost", "how much", "rate", "per night", "nightly", "fee", "charge",
  "expensive", "cheap", "budget",
];

const FACT_KEYWORDS = [
  // TR
  "iptal", "evcil", "check-in", "check-out", "check in", "politika", "olanak",
  "restoran", "oda fiyat", "oda tipi", "oda özellik", "oda ozellik", "kapasite",
  "adres", "köpe", "kope", "kedi", // köpe: köpek + köpeğim (ünsüz yumuşaması)
  // "telefon/phone/contact" bilerek yok: rehber iletişim bilgisi vermez ve
  // telefon kataloğa girmez; zorlanırsa model alakasız bir kart seçer.
  // EN
  "cancel", "refund", "pet", "policy", "policies", "amenit", "facilit",
  "restaurant", "breakfast", "capacity", "address", "dog", "cat",
  "wifi", "parking", "check out",
];

export interface ToolHints {
  needsPriceTool: boolean;
  needsFactTool: boolean;
}

/** "oda/room" + politika-benzeri sözcük → fact sorusu (TR ve EN). */
function mentionsRoomFact(lower: string): boolean {
  const mentionsRoom = /\boda\b/.test(lower) || /\brooms?\b/.test(lower);
  if (!mentionsRoom) return false;
  return [
    "politika", "iptal", "özellik", "ozellik", "tipi", "kapasite",
    "policy", "cancel", "feature", "type", "capacity", "size",
  ].some((kw) => lower.includes(kw));
}

export function detectToolHints(userMessage: string): ToolHints {
  const lower = userMessage.toLowerCase();
  // "ücretsiz/free" bir fiyat sorusu değildir ("Çocuklar ücretsiz mi?" → politika).
  const priceText = lower.replace(/ücretsiz|ucretsiz|ücretsizdir/g, " ");
  return {
    needsPriceTool: PRICE_KEYWORDS.some((kw) => priceText.includes(kw)),
    needsFactTool: FACT_KEYWORDS.some((kw) => lower.includes(kw)) || mentionsRoomFact(lower),
  };
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
          if (!flags.hadPriceTool && textContainsPriceLikeContent(recentText)) {
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

  if (toolName === "getRoomPrice" && result.ok === false) {
    return en
      ? "I couldn't find a price for that request — could you check the dates or room?"
      : `${result.error ? `${result.error} ` : ""}Tarihleri veya odayı değiştirerek tekrar sorabilirsiniz.`;
  }
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
  turn: { runs: Array<{ toolName: ServerToolName; output: unknown }>; reply?: "unknown" | "contact" },
  language: string | undefined,
): string | null {
  const en = Boolean(language && language !== "tr");
  if (!turn.runs.length) {
    if (turn.reply === "unknown") return en ? UNKNOWN_TEXT.en : UNKNOWN_TEXT.tr;
    if (turn.reply === "contact") return en ? CONTACT_TEXT.en : CONTACT_TEXT.tr;
    return null;
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

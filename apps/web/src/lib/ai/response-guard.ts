// ---------------------------------------------------------------------------
// AI yanıt guard — serbest metinde fiyat/rakam engeli
// ---------------------------------------------------------------------------

import type { TextStreamPart, ToolSet } from "ai";

const PRICE_PATTERNS = [
  /₺\s*[\d.,]+/,
  /[\d.,]+\s*₺/,
  /\$\s*[\d.,]+/,
  /[\d.,]+\s*\$/,
  /€\s*[\d.,]+/,
  /[\d.,]+\s*€/,
  /[\d.,]+\s*(TL|tl|TRY|try)\b/,
  /\b[\d.,]+\s*(gece|kişi|kisi)\b/i,
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
  "adres", "telefon",
  // EN
  "cancel", "refund", "pet", "policy", "policies", "amenit", "facilit",
  "restaurant", "breakfast", "capacity", "address", "phone", "contact",
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
  return {
    needsPriceTool: PRICE_KEYWORDS.some((kw) => lower.includes(kw)),
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
 * (OpenAI'ın forced tool-choice'u tek fonksiyon seçer) — model aynı turda
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

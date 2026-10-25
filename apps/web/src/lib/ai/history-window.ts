// ---------------------------------------------------------------------------
// Konuşma geçmişi windowing — modele göndermeden önce sayı-bazlı kırpma.
// ---------------------------------------------------------------------------

import type { ModelMessage } from "ai";

const DEFAULT_MAX_MESSAGES = 16;
const HIDDEN_SENTINEL = "[HIDDEN]";

function isHiddenMessage(message: ModelMessage): boolean {
  if (message.role !== "user") return false;
  if (typeof message.content === "string") return message.content === HIDDEN_SENTINEL;
  if (Array.isArray(message.content)) {
    return message.content.every(
      (part) => part.type === "text" && part.text === HIDDEN_SENTINEL,
    );
  }
  return false;
}

/**
 * Konuşma geçmişini modele göndermeden önce kırpar. Basit sayı-bazlı
 * pencereleme — tur oturumları kısa ömürlü (tek gezinme oturumu) olduğundan
 * LLM-özetleme gibi karmaşık bir çözüm şimdilik gereksiz; gerçek kullanım
 * verisi (bkz. ai_usage token takibi) düzenli olarak pencereyi aştığını
 * gösterirse eklenir.
 *
 * [HIDDEN] sentinel mesajları (sessiz proaktif tetikleyiciler — tourStart,
 * stepStart, idle vb.) düşük bilgi değerine sahiptir ve pencere sınırından
 * ÖNCE elenir; aksi halde idle-ağırlıklı uzun bir oturumda gerçek kullanıcı/
 * asistan turlarını pencereden dışarı iterler.
 */
export function windowConversationHistory(
  messages: ModelMessage[],
  opts: { maxMessages?: number } = {},
): ModelMessage[] {
  const maxMessages = opts.maxMessages ?? DEFAULT_MAX_MESSAGES;
  const meaningful = messages.filter((m) => !isHiddenMessage(m));
  if (meaningful.length <= maxMessages) return meaningful;
  const windowed = meaningful.slice(-maxMessages);
  // Pencere bir kullanıcı mesajıyla başlamalı: kesim bir araç çağrısı ile
  // sonucunun arasına düşerse sahipsiz "tool" mesajı kalır ve Gemini
  // ("function response turn comes immediately after a function call turn")
  // isteği reddeder. Kart turları 3 mesaj olduğundan uzun sohbette olağan.
  const firstUser = windowed.findIndex((m) => m.role === "user");
  return firstUser > 0 ? windowed.slice(firstUser) : windowed;
}

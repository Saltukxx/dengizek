// ---------------------------------------------------------------------------
// POST /api/tour/chat — AI rehber sohbeti.
//
// İşleyici ve yardımcıları chat-handler.ts'de: Next route dosyası yalnız HTTP
// fonksiyonları ve segment ayarı dışa aktarabilir; eval ve testler
// yardımcıları (buildSystemPrompt, runServerTools…) oradan alır.
// ---------------------------------------------------------------------------

export { POST } from "./chat-handler";

// Fonksiyon üst sınırı — takılı bir model stream'i isteği süresiz kilitleyemesin.
export const maxDuration = 60;

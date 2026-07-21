// ---------------------------------------------------------------------------
// Rehber paneli arayüz metinleri — sohbet dili İngilizce'ye geçince panel
// çerçevesi de ("Düşünüyor…" vb.) o dile geçsin diye küçük bir TR/EN
// sözlüğü. Tam bir i18n framework'ü kasıtlı olarak KULLANILMAZ: yalnızca iki
// dil ve bir avuç sabit metin var (AI yanıtlarının dili zaten sunucu
// tarafında system prompt ile yönetiliyor, bkz. language-detect).
// ---------------------------------------------------------------------------

export interface GuideStrings {
  preparing: string;
  thinking: string;
  inputPlaceholder: string;
  send: string;
  voiceStart: string;
  voiceStop: string;
  hereForYou: string;
  sourceTurkish: string;
  defaultPersona: string;
}

const TR: GuideStrings = {
  preparing: "Rehberiniz hazırlanıyor…",
  thinking: "Düşünüyor…",
  inputPlaceholder: "Bir soru sorun...",
  send: "Gönder",
  voiceStart: "Sesli giriş",
  voiceStop: "Sesli girişi durdur",
  hereForYou: "Sizin için buradayım",
  sourceTurkish: "Kaynak: Türkçe",
  defaultPersona: "Yapay Zeka Rehberi",
};

const EN: GuideStrings = {
  preparing: "Your guide is getting ready…",
  thinking: "Thinking…",
  inputPlaceholder: "Ask a question...",
  send: "Send",
  voiceStart: "Voice input",
  voiceStop: "Stop voice input",
  hereForYou: "I'm here for you",
  sourceTurkish: "Source: Turkish",
  defaultPersona: "AI Guide",
};

/** Tespit edilen sohbet diline göre panel metinleri — bilinmeyen dilde TR kalır. */
export function guideStrings(language?: string): GuideStrings {
  return language === "en" ? EN : TR;
}

/**
 * Tespit edilen sohbet dili → Web Speech API BCP-47 kodu. Bilinmeyen dilde
 * undefined döner; use-speech-input tarayıcı diline düşer.
 */
export function speechLocaleFor(language?: string): string | undefined {
  if (language === "tr") return "tr-TR";
  if (language === "en") return "en-US";
  return undefined;
}

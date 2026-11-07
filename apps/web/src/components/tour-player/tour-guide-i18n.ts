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
  voiceReplyOn: string;
  voiceReplyOff: string;
  callStart: string;
  callEnd: string;
  callListening: string;
  callThinking: string;
  callSpeaking: string;
  callPaused: string;
  callDoneTalking: string;
  callInterrupt: string;
  callListenAgain: string;
  callMicDenied: string;
  callFiller: string;
  hereForYou: string;
  sourceTurkish: string;
  defaultPersona: string;
  helpful: string;
  notHelpful: string;
  feedbackThanks: string;
}

const TR: GuideStrings = {
  preparing: "Rehberiniz hazırlanıyor…",
  thinking: "Düşünüyor…",
  inputPlaceholder: "Bir soru sorun...",
  send: "Gönder",
  voiceStart: "Sesli giriş",
  voiceStop: "Sesli girişi durdur",
  voiceReplyOn: "Sesli yanıtı aç",
  voiceReplyOff: "Sesli yanıtı kapat",
  callStart: "Sesli sohbet",
  callEnd: "Bitir",
  callListening: "Dinliyorum…",
  callThinking: "Düşünüyor…",
  callSpeaking: "Konuşuyor…",
  callPaused: "Sizi duyamadım.",
  callDoneTalking: "Bitirdim",
  callInterrupt: "Sözünü kes",
  callListenAgain: "Tekrar dinle",
  callMicDenied: "Mikrofon izni verilmedi. Tarayıcı ayarlarından izin verip tekrar deneyin.",
  callFiller: "Bir saniye, bakıyorum.",
  hereForYou: "Sizin için buradayım",
  sourceTurkish: "Kaynak: Türkçe",
  defaultPersona: "Yapay Zeka Rehberi",
  helpful: "Faydalı",
  notHelpful: "Faydalı değil",
  feedbackThanks: "Teşekkürler",
};

const EN: GuideStrings = {
  preparing: "Your guide is getting ready…",
  thinking: "Thinking…",
  inputPlaceholder: "Ask a question...",
  send: "Send",
  voiceStart: "Voice input",
  voiceStop: "Stop voice input",
  voiceReplyOn: "Turn on spoken replies",
  voiceReplyOff: "Turn off spoken replies",
  callStart: "Voice chat",
  callEnd: "End",
  callListening: "Listening…",
  callThinking: "Thinking…",
  callSpeaking: "Speaking…",
  callPaused: "I couldn't hear you.",
  callDoneTalking: "Done",
  callInterrupt: "Interrupt",
  callListenAgain: "Listen again",
  callMicDenied: "Microphone access was denied. Allow it in your browser settings and try again.",
  callFiller: "One moment, let me check.",
  hereForYou: "I'm here for you",
  sourceTurkish: "Source: Turkish",
  defaultPersona: "AI Guide",
  helpful: "Helpful",
  notHelpful: "Not helpful",
  feedbackThanks: "Thanks",
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

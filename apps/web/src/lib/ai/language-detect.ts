// ---------------------------------------------------------------------------
// Hafif dil tespiti — tek kısa sohbet mesajı için embedding/LLM çağrısı
// gerektirmeyen bir heuristik. Yalnızca Türkçe/İngilizce ayrımını güvenilir
// yapar; başka diller için tarayıcı locale ipucuna düşer. Yetersiz kalırsa
// ileride embedding-similarity sınıflandırmaya yükseltilebilir (bkz. plan
// Faz 3.1'in embedding altyapısı).
// ---------------------------------------------------------------------------

// ı/İ/ş/Ş/ğ/Ğ diğer yaygın dillerde neredeyse hiç geçmez — güçlü Türkçe sinyali.
const TURKISH_CHAR_PATTERN = /[ışğİŞĞ]/;

const TURKISH_STOPWORDS = new Set([
  "ve", "bir", "bu", "şu", "için", "ile", "de", "da", "mi", "mı", "mu", "mü",
  "var", "yok", "ne", "nerede", "nasıl", "hangi", "kim", "kaça", "kaç",
  "merhaba", "teşekkür", "teşekkürler", "evet", "hayır", "lütfen", "misiniz",
  "musunuz", "istiyorum", "otel", "oda", "saat", "kadar", "nedir",
]);

const ENGLISH_STOPWORDS = new Set([
  "the", "is", "are", "you", "what", "how", "can", "please", "thanks",
  "thank", "hello", "hi", "yes", "no", "room", "price", "booking", "would",
  "like", "have", "does",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-zçğıöşüA-ZÇĞİÖŞÜ]+/u)
    .filter(Boolean);
}

/**
 * Kullanıcı mesajından dil tahmini yapar. Belirsizse browserLocale'e
 * (yalnızca UX ipucu, asla otoriter) düşer; o da yoksa undefined döner —
 * çağıran taraf hotelProfile.language varsayılanını korumalı.
 */
export function detectLanguageHint(message: string, browserLocale?: string): string | undefined {
  const trimmed = message.trim();
  if (!trimmed) return undefined;

  if (TURKISH_CHAR_PATTERN.test(trimmed)) return "tr";

  const tokens = tokenize(trimmed);
  let trScore = 0;
  let enScore = 0;
  for (const token of tokens) {
    if (TURKISH_STOPWORDS.has(token)) trScore += 1;
    if (ENGLISH_STOPWORDS.has(token)) enScore += 1;
  }
  if (trScore > enScore) return "tr";
  if (enScore > trScore) return "en";

  if (browserLocale) {
    const lang = browserLocale.split("-")[0]?.toLowerCase().trim();
    if (lang) return lang;
  }
  return undefined;
}

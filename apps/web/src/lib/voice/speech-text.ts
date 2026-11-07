// ---------------------------------------------------------------------------
// Sesli yanıt metni — rehber cevabını seslendirmeye hazırlar.
//
// Piper (espeak tabanlı) bazı yazımları kötü okur: "TL" → "te le",
// "14:00" → "on dört sıfır sıfır", "**" → "yıldız yıldız". Cevap ekranda
// olduğu gibi kalır; yalnız seslendirilen kopya düzenlenir. Tarayıcı sesi de
// aynı metni okur, kural ikisi için ortaktır.
// ---------------------------------------------------------------------------

/** Tek bir seslendirme isteğindeki en uzun parça (sunucu sınırının altında). */
export const MAX_SPEECH_CHARS = 300;

const CURRENCY_WORDS: Record<string, { tr: string; en: string }> = {
  "₺": { tr: "lira", en: "lira" },
  "€": { tr: "avro", en: "euros" },
  $: { tr: "dolar", en: "dollars" },
};

/** Ekrandaki cevap metnini sesli okunacak hale getirir. */
export function prepareSpeechText(text: string, language: "tr" | "en" = "tr"): string {
  let out = text;

  // Bağlantılar okunmaz; markdown bağlantısında yalnız yazı kalır.
  out = out.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  out = out.replace(/\bhttps?:\/\/\S+/gi, "");
  out = out.replace(/\bwww\.\S+/gi, "");

  // Markdown işaretleri ve emojiler.
  out = out.replace(/\*\*|__|`+/g, "");
  out = out.replace(/(^|\s)\*(?=\S)|(?<=\S)\*(?=\s|$)/g, "$1");
  out = out.replace(/^\s*#{1,6}\s+/gm, "");
  out = out.replace(/^\s*[-*•]\s+/gm, "");
  out = out.replace(/\p{Extended_Pictographic}️?/gu, "");

  // Para birimi: "₺12.500" ve "12.500 ₺" → "12.500 lira"; "TL" → "lira".
  for (const [symbol, words] of Object.entries(CURRENCY_WORDS)) {
    const escaped = symbol.replace(/[$]/g, "\\$");
    const word = words[language];
    // Sayı rakamla biter — cümle sonundaki nokta sayıya katılmasın.
    out = out.replace(new RegExp(`${escaped}\\s?(\\d(?:[\\d.,]*\\d)?)`, "g"), `$1 ${word}`);
    out = out.replace(new RegExp(`\\s?${escaped}`, "g"), ` ${word}`);
  }
  out = out.replace(/\bTL\b/g, CURRENCY_WORDS["₺"]![language]);

  // Saat: "14:00" → "14", "09:30" → "9 30".
  out = out.replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g, (_m, h: string, m: string) => {
    const hour = String(Number(h));
    return m === "00" ? hour : `${hour} ${m}`;
  });

  // Aralık: "2-4 kişi" → "2 ila 4 kişi".
  const rangeWord = language === "en" ? "to" : "ila";
  out = out.replace(/\b(\d{1,4})\s?[-–]\s?(\d{1,4})\b/g, `$1 ${rangeWord} $2`);

  return out.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

// Cümle sonu: nokta/ünlem/soru (+ kapanan tırnak/parantez) ve ardından boşluk,
// ya da satır sonu. "12.500" ve "14.00" boşluksuz olduğu için bölünmez; akışta
// metin "12." ile bitse bile sonraki parça gelene kadar beklenir.
const BOUNDARY = /[.!?…]+["'”’)\]]*(?=\s)|\n+/g;

/**
 * Akış halindeki cevaptan okunmaya hazır cümleleri ayırır.
 * `final` true ise (cevap bitti) kalan son parça da hazır sayılır.
 * `consumed`: metnin başından kaç karakter tüketildi.
 */
export function takeSentences(text: string, final: boolean): { ready: string[]; consumed: number } {
  const ready: string[] = [];
  let start = 0;
  for (const match of text.matchAll(BOUNDARY)) {
    const end = (match.index ?? 0) + match[0].length;
    pushPiece(ready, text.slice(start, end));
    start = end;
  }
  if (final) {
    pushPiece(ready, text.slice(start));
    start = text.length;
  }
  return { ready, consumed: start };
}

function pushPiece(target: string[], raw: string) {
  const piece = raw.trim();
  if (!piece) return;
  target.push(...splitLong(piece));
}

/** Çok uzun cümleyi virgülden, olmazsa boşluktan böler. */
export function splitLong(piece: string, max = MAX_SPEECH_CHARS): string[] {
  const parts: string[] = [];
  let rest = piece;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    const cut = Math.max(window.lastIndexOf(", "), window.lastIndexOf("; "));
    const at = cut > max / 3 ? cut + 1 : window.lastIndexOf(" ");
    const index = at > 0 ? at : max;
    parts.push(rest.slice(0, index).trim());
    rest = rest.slice(index).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

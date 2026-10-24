// ---------------------------------------------------------------------------
// İletişim bilgisi koruması.
//
// Misafir ile tesis yalnız Otelsayfam üzerinden yazışır ve rezervasyon yalnız
// buradan alınır. Serbest metinle telefon, e-posta, web adresi ya da sosyal
// medya hesabı paylaşmak bu kuralı deler; bu modül o parçaları bulur ve
// maskeler. Saf fonksiyonlar — sunucu ve istemci ortak kullanır.
//
// Sınırı: kalıp eşleştirir. "sıfır beş otuz iki…" gibi yazıyla verilen
// numaraların yaygın biçimlerini yakalar, ama kararlı bir kullanıcının her
// kılık değiştirmesini yakalayamaz; moderasyonun yerini tutmaz.
// ---------------------------------------------------------------------------

export const CONTACT_MASK = "[iletişim bilgisi gizlendi]";

// Düz noktanın çevresinde boşluk kabul edilmez; yoksa "x@y.org. 10.12.2026"
// cümlesinde tarih de adresin devamı sanılır. Boşluk yalnız "(dot)" yazımında serbesttir.
const EMAIL =
  /[\w.+-]+\s?(?:@|\(at\)|\[at\])\s?[\w-]+(?:\.[\w-]+|\s?(?:\(dot\)|\[dot\]|\(nokta\))\s?[\w-]+)+/giu;
const URL = /\b(?:https?:\/\/|www\.)[^\s<>()]+/giu;
const BARE_DOMAIN =
  /\b[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|info|biz|io|co|me|app|link|tr|de|uk|ru|eu)(?:\.[a-z]{2})?\b(?:\/[^\s<>()]*)?/giu;
const HANDLE = /(?<![\w.])@[\w.]{3,30}\b/gu;
// Rakamla başlayıp biten, arada boşluk/ayraç olabilen dizi; rakam sayısına aşağıda bakılır.
const PHONE_CANDIDATE = /(?:\+|00)?\d(?:[\s().\-/]{0,3}\d){8,16}/gu;
// Tarihler telefon sanılmasın: 2026-10-03, 03.10.2026, 3/10/26
const DATE_TOKEN = /\b(?:\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\b/gu;
const DIGIT_WORD =
  "(?:s[ıi]f[ıi]r|bir|iki|[uü][cç]|d[oö]rt|be[sş]|alt[ıi]|yedi|sekiz|dokuz|on|yirmi|otuz|k[ıi]rk|elli|altm[ıi][sş]|yetmi[sş]|seksen|doksan|y[uü]z|zero|one|two|three|four|five|six|seven|eight|nine)";
// \\b Türkçe harflerde (ü, ç, ı) kelime sınırını tanımaz; harf bakışıyla sınırlanır.
const SPELLED_NUMBER = new RegExp(`(?:(?<!\\p{L})${DIGIT_WORD}(?!\\p{L})[\\s,.-]*){7,}`, "giu");

const DATE_PLACEHOLDER = "";

function maskPhones(text: string): string {
  // Tarihleri geçici olarak kaldır, numara ara, sonra geri koy.
  const dates: string[] = [];
  const withoutDates = text.replace(DATE_TOKEN, (match) => {
    dates.push(match);
    return DATE_PLACEHOLDER;
  });
  const masked = withoutDates.replace(PHONE_CANDIDATE, (match) =>
    match.replace(/\D/g, "").length >= 9 ? CONTACT_MASK : match,
  );
  let i = 0;
  return masked.replace(new RegExp(DATE_PLACEHOLDER, "g"), () => dates[i++] ?? "");
}

/** Metindeki iletişim bilgilerini maskeler. */
export function redactContactInfo(text: string): string {
  if (!text) return text;
  let out = text.replace(EMAIL, CONTACT_MASK).replace(URL, CONTACT_MASK).replace(BARE_DOMAIN, CONTACT_MASK);
  out = out.replace(HANDLE, CONTACT_MASK);
  out = maskPhones(out);
  out = out.replace(SPELLED_NUMBER, `${CONTACT_MASK} `);
  // Art arda gelen maskeleri tekille.
  return out.replace(/(?:\[iletişim bilgisi gizlendi\][\s,;/-]*){2,}/gu, `${CONTACT_MASK} `).trimEnd();
}

export function containsContactInfo(text: string | null | undefined): boolean {
  return Boolean(text) && redactContactInfo(text as string) !== text;
}

export function redactNullable<T extends string | null | undefined>(text: T): T {
  return (typeof text === "string" ? redactContactInfo(text) : text) as T;
}

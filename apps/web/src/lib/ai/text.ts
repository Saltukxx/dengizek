// ---------------------------------------------------------------------------
// Ortak metin yardımcıları — AI sunucu araçları (fiyat, tarih, bilgi seçimi).
// ---------------------------------------------------------------------------

/** Küçük harf, Türkçe karakterleri sadeleştirir, check-in/out'u tek kelime yapar. */
export function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .replace(/â/g, "a")
    .replace(/check[\s_-]?in/g, "checkin")
    .replace(/check[\s_-]?out/g, "checkout")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(value: string): string[] {
  return normalizeText(value).split(" ").filter((t) => t.length >= 3);
}

/**
 * Türkçe ekleri tolere eden eşleşme: kısa kelime uzunun başıysa eşleşir
 * ("hayvan" ↔ "hayvanlari"). Ortak önek yetmez — "checkin" ≠ "checkout".
 */
export function stemMatch(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 3 && long.startsWith(short);
}

/**
 * Embedding yokken (servis/kota hatası) kullanılan eş anlamlılar: misafirin
 * kelimesi kartta geçen kelimeyle aynı değilse de eşleşsin ("çıkmamız" →
 * "çıkış", "köpek" → "evcil hayvan"). Anahtar: normalize kelimenin başı.
 */
const SYNONYMS: Array<[RegExp, string[]]> = [
  [/^(cik|ayril|checkout|leave)/, ["cikis", "checkout", "ayrilis"]],
  [/^(gir|checkin|arriv)/, ["giris", "checkin"]],
  [/^(time|kacta|saat)/, ["saati"]],
  [/^(kopeg|kopek|kedi|evcil|pet$|pets$|dog|cat$|cats$)/, ["evcil", "hayvan"]],
  [/^(yemek|yemeg|konsept|pansiyon|kahvalt|aksam|board|meal|breakfast|dinner)/, ["pansiyon", "yemek", "yemeg", "kahvalti"]],
  [/^(havaliman|havaalan|airport)/, ["havalimani", "havaalani"]],
  [/^(uzak|mesafe|distance|far$)/, ["mesafe", "uzak"]],
  // "kulübü" / "klübü" / "club" aynı yazım farkı.
  [/^(kulub|klub|club)/, ["kulub", "klub", "club"]],
  [/^(derece|sicaklik|isi$|temperature|degree)/, ["derece", "sicaklik"]],
  // Oda kartı "2 yetişkin + 1 çocuk" der; misafir "kaç kişilik" diye sorar.
  [/^(kisilik|kisi$|kapasite|capacity|sleeps|yetiskin)/, ["yetiskin", "kisilik"]],
];

/** Kelimenin eş anlamlıları (normalize); eşleşme yoksa undefined. */
export function synonymsOf(token: string): string[] | undefined {
  return SYNONYMS.find(([pattern]) => pattern.test(token))?.[1];
}

/**
 * Ek toleranslı eşleşme, stemMatch'ten sıkı: kısa kelime en az 4 harf ve ek
 * ünlüyle ya da s/l/n/d/y/t/m + ünlüyle başlar ("havuzu" ↔ "havuz",
 * "mesafededir" ↔ "mesafe"; "masaj" ≠ "masa", "havalimani" ≠ "hava").
 */
export function suffixMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 4 || !long.startsWith(short)) return false;
  const suffix = long.slice(short.length);
  // 4 harflik kökte kısa ek ("kese" → "kesesi"); uzun ek bileşik kelimedir ("hava" ≠ "havalimani").
  return suffix.length <= (short.length === 4 ? 3 : 9) && /^([aeiou]|[slndytm][aeiou])/.test(suffix);
}

/** Yer değiştirmiş harfi (otoprak ↔ otopark) tek hata sayan düzenleme uzaklığı. */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j += 1) d[0]![j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  }
  return d[a.length]![b.length]!;
}

/** Kelime uzunluğuna göre izin verilen yazım hatası: <5 harf 0, 5-7 harf 1, 8+ harf 2. */
export function typoAllowance(word: string): number {
  return word.length < 5 ? 0 : word.length < 8 ? 1 : 2;
}

/**
 * Yazım hatalı kelimenin sözlükteki karşılığı. Tek ve açık bir en yakın aday
 * yoksa null (iki aday eşit yakınsa tahmin edilmez).
 */
export function closestWord(word: string, vocabulary: Iterable<string>): string | null {
  const allowed = typoAllowance(word);
  if (!allowed) return null;
  let best: string | null = null;
  let bestDistance = allowed + 1;
  let tie = false;
  for (const candidate of vocabulary) {
    if (candidate.length < 5) continue;
    const distance = editDistance(word, candidate, allowed);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
      tie = false;
    } else if (distance === bestDistance && candidate !== best) {
      tie = true;
    }
  }
  return best && !tie && bestDistance <= allowed && bestDistance > 0 ? best : null;
}

/**
 * Aynı soruyu gruplamak için anahtar: "Afyon'da" ile "afyonda" aynı sayılır
 * (kesme işareti boşluk değil, yok sayılır).
 */
export function groupingKey(value: string): string {
  return normalizeText(value.replace(/[’'`]/g, ""));
}

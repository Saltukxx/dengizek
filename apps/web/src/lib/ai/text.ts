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

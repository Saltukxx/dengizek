// ---------------------------------------------------------------------------
// Olanak soruları — "Fitness var mı?", "Do you have a gym?", "Havuz var mı?"
//
// Otelin olanak listesi (spec.amenities) farklı yazımlarla gelir: "Fitness
// Center", "fitness", "Wi - Fi", "ucretsiz-wifi", "İnternet Erişimi"…
// Misafir de farklı kelimeler kullanır: "spor salonu", "gym", "pool".
// İki taraf aynı sözlükle ortak karşılığa çevrilir, sonra kelime kelime
// eşleştirilir. Sunucu cevabı yalnız listede bulunan olanaklarla verilir.
// ---------------------------------------------------------------------------

import { normalizeText, suffixMatch, tokens } from "@/lib/ai/text";

/**
 * Ortak karşılıklar (normalize metin üzerinde, sırayla uygulanır). Uzun
 * ifadeler önce: "kapali havuz" → "kapali havuz", "indoor pool" → "kapali havuz".
 */
const CANONICAL: Array<[RegExp, string]> = [
  // Spor
  [/\b(spor salon\w*|fitness center|fitness merkezi|fitness salon\w*|fitnes+|gym|gymnasium|antrenman salon\w*)\b/g, "fitness"],
  [/\b(table tennis|ping ?pong)\b/g, "masa tenisi"],
  [/\b(tennis court\w*|tennis)\b/g, "tenis"],
  [/\b(billiards?|pool table)\b/g, "bilardo"],
  // Havuz
  [/\b(indoor (swimming )?pools?)\b/g, "kapali havuz"],
  [/\b(outdoor (swimming )?pools?)\b/g, "acik havuz"],
  [/\b(thermal (swimming )?pools?)\b/g, "termal havuz"],
  [/\b(kids|children'?s?|child) (swimming )?pools?\b/g, "cocuk havuzu"],
  [/\b(water ?slides?|kaydirak\w*)\b/g, "kaydirakli"],
  [/\b(water ?park|aqua ?park|su parki)\b/g, "aquapark"],
  [/\b(swimming pools?|pools?|yuzme havuz\w*)\b/g, "havuz"],
  // Islak alanlar
  [/\b(jacuzzi|jakuzi\w*|hot tub)\b/g, "jakuzi"],
  [/\b(turkish bath|hammam|hamam\w*)\b/g, "hamam"],
  [/\b(steam room|buhar oda\w*)\b/g, "buhar"],
  [/\b(saunas?|sauna\w*)\b/g, "sauna"],
  [/\b(massages?|masaj\w*)\b/g, "masaj"],
  [/\b(spa merkez\w*|spa center|spa)\b/g, "spa"],
  // Yeme içme
  [/\b(restaurants?|restoran\w*|restaurant\w*|lokanta\w*)\b/g, "restoran"],
  [/\b(beach bar|plaj bar\w*)\b/g, "plaj bar"],
  // Ulaşım / altyapı
  [/\b(parking( lot)?|car park|park yeri|otopark\w*)\b/g, "otopark"],
  [/\b(wi ?fi|wireless|kablosuz( internet)?|internet( baglanti\w*| erisim\w*)?)\b/g, "internet"],
  [/\b(elevators?|lifts?|asansor\w*)\b/g, "asansor"],
  [/\b(air ?condition\w*|klima\w*)\b/g, "klima"],
  [/\b(airport (transfer|shuttle)\w*|havalimani (servis|transfer)\w*|havaalani (servis|transfer)\w*)\b/g, "havalimaniservisi"],
  [/\b(laundry|camasir\w*|kuru temizleme|dry cleaning)\b/g, "camasir"],
  [/\b(meeting rooms?|conference rooms?|toplanti salon\w*)\b/g, "toplanti"],
  [/\b(hair ?dressers?|kuafor\w*)\b/g, "kuafor"],
  [/\b(doctors?|doktor\w*)\b/g, "doktor"],
  // Oda
  [/\b(room service|oda servis\w*)\b/g, "odaservisi"],
  [/\b(hair ?dryers?|sac kurutma\w*( makine\w*)?)\b/g, "sac kurutma"],
  [/\b(balcon(y|ies)|balkon\w*)\b/g, "balkon"],
  [/\b(televisions?|tv|televizyon\w*)\b/g, "televizyon"],
  [/\b(safe box|safety box|in ?room safe|kasa\w*)\b/g, "kasa"],
  [/\b(minibar|mini bar)\b/g, "minibar"],
  // Çocuk
  [/\b(kids'? club|kids club|mini ?club|junior club|cocuk kulub\w*)\b/g, "cocuk kulubu"],
  [/\b(playground|play area|oyun alan\w*)\b/g, "oyun alani"],
  [/\b(animation|entertainment|animasyon\w*)\b/g, "animasyon"],
  [/\b(kids|children|childrens|cocuklar\w*)\b/g, "cocuk"],
  // Diğer
  [/\b(denize sifir|beach ?front|sea ?front)\b/g, "denizesifir"],
  [/\b(beach|plaj\w*)\b/g, "plaj"],
  [/\b(golf)\b/g, "golf"],
  [/\b(casino|kumarhane)\b/g, "casino"],
];

/** Soru kalıbı kelimeleri — olanağın adı değil. */
const QUESTION_TERMS = new Set([
  "var", "varmi", "mevcut", "bulunuyor", "bulunur", "sunuyor", "sunuluyor", "saglaniyor", "musunuz",
  "misiniz", "otel", "otelde", "otelin", "oteliniz", "otelinizde", "tesis", "tesiste", "tesisinizde",
  "hotel", "there", "have", "offer", "does", "you", "the", "your", "any", "and", "veya", "icin",
  "bir", "acaba", "peki", "hizmet", "hizmeti", "hizmetiniz", "olanak", "imkan", "here", "property",
  // Yer belirten kelimeler: "Odalarda klima var mı?" → klima.
  "oda", "odada", "odalarda", "odalarinizda", "odanizda", "odalarin", "room", "rooms", "the room", "in",
]);

/** Ücret sorusu belirten kelimeler — olanağın adı değil, ama cevapta ayrıca söylenir. */
const PRICE_QUALIFIERS = new Set(["ucretsiz", "bedava", "free", "ucretli", "paid", "complimentary", "ucret", "ucreti"]);

/** Sözlükteki bir ifadenin parçası olan kelimeler ("denize sıfır" → denize, sifir). */
export function canonicalSourceWords(value: string): Set<string> {
  const text = normalizeText(value);
  const words = new Set<string>();
  for (const [pattern] of CANONICAL) {
    for (const match of text.matchAll(pattern)) tokens(match[0]).forEach((w) => words.add(w));
  }
  return words;
}

/** Normalize + ortak karşılık ("Mini Club" → "cocuk kulubu", "pool" → "havuz"). */
export function canonicalAmenityText(value: string): string {
  return canonical(value);
}

function canonical(value: string): string {
  let text = normalizeText(value);
  for (const [pattern, replacement] of CANONICAL) text = text.replace(pattern, replacement);
  return text;
}

const wordMatch = suffixMatch;

/** Misafirin sorduğu olanak kelimeleri (ortak karşılıkla). */
export function amenityTerms(message: string): string[] {
  return tokens(canonical(message)).filter((t) => !QUESTION_TERMS.has(t) && !PRICE_QUALIFIERS.has(t));
}

/** "Ücretsiz otopark var mı?" — liste ücret bilgisi taşımaz; cevap bunu söyler. */
export function asksAmenityPrice(message: string): boolean {
  return tokens(normalizeText(message)).some((t) => PRICE_QUALIFIERS.has(t));
}

/**
 * Sorulan olanakla eşleşen liste öğeleri. Sorudaki her kelime olanağın
 * adında geçmeli: "Termal havuz" yalnız "Termal Havuz"u, "Havuz" tüm
 * havuzları bulur; "Bay havuzu" "Bayan Havuzu" değildir. Konu kelimesi
 * yoksa boş döner.
 */
export function matchAmenities(message: string, items: string[]): string[] {
  const terms = amenityTerms(message);
  if (!terms.length) return [];
  const matching = (wanted: string[]) =>
    items.filter((label) => {
      const parts = tokens(canonical(label));
      return parts.length > 0 && wanted.every((term) => parts.some((part) => wordMatch(term, part)));
    });
  const exact = matching(terms);
  if (exact.length) return exact;
  // "Golf sahası" → "Mini Golf": yer kelimesi (saha, alan, merkez) olanağın adında olmayabilir.
  const core = terms.filter((t) => !PLACE_WORDS.test(t));
  return core.length && core.length < terms.length ? matching(core) : [];
}

const PLACE_WORDS = /^(saha|alan|merkez|area|field|course|facilit)/;

/**
 * Soru bilinen bir olanak kavramı mı soruyor ("spor salonu", "pool")? Listede
 * de metinlerde de karşılığı yoksa sunucu "bilgim yok" der; model "evet"
 * uyduramaz.
 */
export function asksKnownAmenity(message: string): boolean {
  return amenityTerms(message).some((term) => KNOWN_AMENITY_WORDS.has(term));
}

/** Tek başına olanak adı olmayan niteleyiciler ("açık", "termal", "çocuk"). */
export const AMENITY_MODIFIERS = new Set(["acik", "kapali", "termal", "cocuk", "masa", "sac", "oyun", "alani", "kurutma", "plaj"]);

/** Sözlüğün ortak karşılıkları — misafir bunlardan birini soruyorsa bilinen bir olanak sorusudur. */
export const KNOWN_AMENITY_WORDS = new Set(
  CANONICAL.flatMap(([, replacement]) => replacement.split(" ")).filter((w) => w.length >= 3 && !AMENITY_MODIFIERS.has(w)),
);

/**
 * Katalog metinlerinde (otel ifadeleri dahil) sorulan olanak geçiyor mu?
 * Kelimeler yan yana olmalı: uzun bir metinde "çocuk" ve "havuz" ayrı
 * yerlerde geçmesi "çocuk havuzu var" demek değildir.
 */
export function textsMentionAmenity(message: string, texts: string[]): boolean {
  const terms = amenityTerms(message).filter((t) => !PLACE_WORDS.test(t));
  if (!terms.length) return false;
  const span = terms.length + 1;
  return texts.some((text) => {
    const words = tokens(canonical(text));
    return words.some((_, start) => {
      const window = words.slice(start, start + span);
      return wordMatch(terms[0]!, words[start]!) && terms.every((term) => window.some((w) => wordMatch(term, w)));
    });
  });
}

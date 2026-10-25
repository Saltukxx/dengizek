// ---------------------------------------------------------------------------
// Otel arama asistanı — "Afyon'da çocuk havuzu olan otel", "evcil hayvan kabul
// eden termal otel", "4 kişilik aile odası olan", "havalimanına yakın".
//
// Model YOK: sorgu kurallarla filtrelere çevrilir, her otel kendi verisiyle
// (olanak listesi, oda kapasitesi, pansiyon, otel metinleri) karşılaştırılır.
// Sonuç uydurulamaz ve kota gerektirmez. Her sonuçla birlikte NEDEN
// listelendiği ("Çocuk Havuzu", "Afyonkarahisar") gösterilir; anlaşılmayan
// kelimeler açıkça söylenir.
// ---------------------------------------------------------------------------

import {
  AMENITY_MODIFIERS,
  canonicalSourceWords,
  KNOWN_AMENITY_WORDS,
  canonicalAmenityText,
  matchAmenities,
  textsMentionAmenity,
} from "@/lib/ai/amenity-match";
import { parseGuests } from "@/lib/ai/stay-query";
import { closestWord, normalizeText, suffixMatch, tokens } from "@/lib/ai/text";

export interface SearchIndexHotel {
  slug: string;
  name: string;
  city: string | null;
  /** "Afyonkarahisar / Merkez" — ilçe de aranır. */
  address: string | null;
  imageUrl: string | null;
  starRating: number | null;
  amenities: string[];
  petsAllowed: boolean | null;
  rooms: Array<{ name: string; capacityAdults: number; capacityChildren: number; boardType: string | null }>;
  /** Otelin metinleri (otel ifadeleri, politikalar). */
  texts: string[];
  /** Metinden çıkarılan en yakın havalimanı mesafesi (km). */
  airportKm: number | null;
}

type Board = "kahvalti-dahil" | "yarim-pansiyon" | "tam-pansiyon" | "hersey-dahil";

export interface ParsedSearch {
  /** Olanak ifadeleri, ör. "cocuk havuzu", "fitness". */
  amenities: Array<{ phrase: string; label: string }>;
  /** Normalize şehir/ilçe adayları (sorgudaki kelimeler). */
  places: string[];
  pets: boolean;
  /** "4 kişilik", "2 yetişkin 2 çocuk" → oda en az bu kadar kişi almalı. */
  guests: number | null;
  familyRoom: boolean;
  board: Board | null;
  nearAirport: boolean;
  minStars: number | null;
  /** Puanlı kavramlar ("çocuk dostu", "balayı", "spa ağırlıklı"). */
  concepts: ConceptKey[];
  /** Anlaşılmayan kelimeler (misafire söylenir). */
  unknown: string[];
  /** Düzeltilen yazım hataları ("otoprak" → "otopark"). */
  corrections: Array<{ from: string; to: string }>;
}

export interface SearchResult {
  slug: string;
  name: string;
  city: string | null;
  imageUrl: string | null;
  /** Karşılanan istekler: "Çocuk Havuzu", "Afyonkarahisar", "Evcil hayvan kabul edilir". */
  matched: string[];
  /** Karşılanmayan istekler. */
  missing: string[];
  airportKm: number | null;
  /** Kavram kanıtı sayısı — çok olan üstte. */
  conceptScore: number;
}

export interface SearchResponse {
  query: ParsedSearch;
  /** Bu sonucu üreten aramalar (takip sorularıyla birlikte, eskiden yeniye). */
  chain: string[];
  /** Tüm isteklere uyan oteller. */
  results: SearchResult[];
  /** Tam eşleşme yoksa: en çok isteğe uyanlar. */
  partial: SearchResult[];
  /** Misafire gösterilecek tek cümlelik özet. */
  summary: string;
}

// ---------------------------------------------------------------------------
// Sorgu ayrıştırma
// ---------------------------------------------------------------------------

/** Arama cümlesinde anlamı olmayan kelimeler. */
const FILLER = new Set([
  "otel", "oteller", "otelleri", "otelde", "otelin", "hotel", "hotels", "tesis", "tesisler", "tesisi", "yer", "yerler",
  "olan", "olanlar", "olsun", "bulunan", "var", "mevcut", "icin", "ile", "bir", "birkac", "hangi", "hangisi", "nerede",
  "istiyorum", "ariyorum", "bul", "bulur", "musun", "misin", "oner", "onerir", "onerin", "liste", "listele", "goster",
  "lazim", "gerek", "tavsiye", "ve", "veya", "ya", "da", "de", "en", "iyi", "guzel", "uygun", "bana", "bize", "acaba",
  "with", "and", "the", "for", "near", "find", "show", "me", "any", "that", "has", "have", "which", "where", "in", "a",
  "termal", "thermal", "kaplica", "spa", "otelleri", "konaklama", "tatil", "aile", "family", "kisilik", "kisi",
  "yetiskin", "cocuk", "cocuklu", "people", "adults", "children", "kids", "oda", "odasi", "odali", "room", "rooms",
  "kabul", "eden", "edilen", "allowed", "friendly", "yakin", "yakinda", "close", "to", "km", "yildiz", "yildizli",
  "star", "stars", "dahil", "included", "pansiyon", "board", "all", "inclusive", "kahvalti", "breakfast",
  "saha", "sahasi", "sahali", "alani", "alanli", "hizmeti", "hizmetli",
  // Takip sorusu kelimeleri ("bunlardan hangisi…")
  "bunlardan", "bunlarin", "bunlar", "iclerinden", "icinden", "hangisi", "hangileri", "olanlar", "olanlari", "peki",
  "ayrica", "sadece", "yalnizca", "yalniz", "these", "them", "only", "one", "ones", "of", "also", "then", "what", "about",
]);

/** Önceki sonuçları daraltan/değiştiren takip cümlesi ("Bunlardan hangisi…", "Peki Denizli'de?"). */
const FOLLOW_UP =
  /\b(bunlardan|bunlarin|bunlar|iclerinden|icinden|hangisi|hangileri|olanlar|olanlari|peki|ayrica|bir de|sadece|yalnizca|of these|which one|which of|only those|what about|and also)\b/;

export function isFollowUp(query: string): boolean {
  return FOLLOW_UP.test(normalizeText(query.replace(/[’'`]/g, " ")));
}

/**
 * Takip sorusunu önceki isteklere ekler: olanaklar birikir; yeni şehir,
 * kişi sayısı, pansiyon ve yıldız öncekinin yerine geçer.
 */
export function mergeSearches(previous: ParsedSearch, next: ParsedSearch): ParsedSearch {
  return {
    amenities: [...previous.amenities, ...next.amenities.filter((a) => !previous.amenities.some((p) => p.phrase === a.phrase))],
    places: next.places.length ? next.places : previous.places,
    pets: previous.pets || next.pets,
    guests: next.guests ?? previous.guests,
    familyRoom: next.familyRoom || (next.guests ? false : previous.familyRoom),
    board: next.board ?? previous.board,
    nearAirport: previous.nearAirport || next.nearAirport,
    minStars: next.minStars ?? previous.minStars,
    concepts: [...new Set([...previous.concepts, ...next.concepts])],
    unknown: next.unknown,
    corrections: next.corrections,
  };
}

/** Yer adına eklenen bulunma/ayrılma ekleri ("afyonda", "denizlideki"). */
const PLACE_SUFFIX = /^(da|de|ta|te|daki|deki|taki|teki|dan|den|tan|ten|a|e|ya|ye|in|un|nin|nun|li|lu)$/;

function placeMatch(token: string, place: string): boolean {
  if (token === place) return true;
  return token.length > place.length && token.startsWith(place) && PLACE_SUFFIX.test(token.slice(place.length)) && !(place.length < 4);
}

/** Normalize kelimelerin okunur yazımı (özet cümlesi için). */
const DISPLAY: Record<string, string> = {
  cocuk: "çocuk", acik: "açık", kapali: "kapalı", kulubu: "kulübü", asansor: "asansör", camasir: "çamaşırhane",
  sac: "saç", odaservisi: "oda servisi", havalimaniservisi: "havalimanı servisi", alani: "alanı", toplanti: "toplantı salonu",
  kuafor: "kuaför", bilardo: "bilardo", denizesifir: "denize sıfır", televizyon: "televizyon", masa: "masa", tenisi: "tenisi", kaydirakli: "kaydıraklı",
};
const display = (phrase: string) => phrase.split(" ").map((w) => DISPLAY[w] ?? w).join(" ");

/** Kısaltılmış şehir adları. */
const PLACE_ALIASES: Record<string, string[]> = {
  afyon: ["afyon", "afyonkarahisar"],
  afyonkarahisar: ["afyon", "afyonkarahisar"],
  // Bölge adları: otellerin adresinde il yazılı.
  kapadokya: ["nevsehir"],
  cappadocia: ["nevsehir"],
};

function isKnownAmenityWord(token: string): boolean {
  for (const word of KNOWN_AMENITY_WORDS) {
    // Tek yönlü: sorulan kelime sözlük kelimesinin ekli hali olabilir ("havuzlu"),
    // tersi değil ("deniz" ≠ "denizesifir").
    if (token === word || token === `${word}li` || token === `${word}lu` || (word.length >= 4 && token.length >= word.length && suffixMatch(token, word))) return true;
  }
  return false;
}

/** "havuzlu" → "havuz", "otoparkli" → "otopark": -lı/-lu ekli olanak kelimesi. */
function stripWith(token: string): string {
  return /(li|lu)$/.test(token) && isKnownAmenityWord(token.slice(0, -2)) ? token.slice(0, -2) : token;
}

// ---------------------------------------------------------------------------
// Puanlı kavramlar — tek bir olanak değil, birden çok kanıtla ölçülen istekler.
// Otel ancak yeterli kanıt varsa kavrama uymuş sayılır; kanıtlar misafire
// gösterilir. Veriden kanıtlanamayan istekler ("sakin", "lüks") burada yok:
// anlamış gibi yapmak yerine "anlayamadım" denir.
// ---------------------------------------------------------------------------

export type ConceptKey = "cocuk-dostu" | "balayi" | "spa-kur";

interface Concept {
  key: ConceptKey;
  label: string;
  /** Özet cümlesindeki ifade ("balayına uygun"). */
  phrase: string;
  /** Metin kanıtının misafire gösterilen adı. */
  textLabel?: string;
  /** Sorguda kavramı belirten ifade (normalize). */
  ask: RegExp;
  /** Sorgudan "anlaşıldı" sayılacak kelimeler. */
  words: RegExp;
  /** Olanak adında kanıt (normalize). */
  amenity: RegExp;
  /** Otel metninde güçlü kanıt (tek başına yeter). */
  text?: RegExp;
  /** Aile odası kanıt sayılır mı. */
  familyRooms?: boolean;
  /** Kavrama uymak için gereken en az kanıt. */
  min: number;
}

const CONCEPTS: Concept[] = [
  {
    key: "cocuk-dostu",
    label: "Çocuk dostu",
    phrase: "çocuk dostu",
    ask: /\b(cocuk dostu|cocuklu|cocuklarla|cocuklar icin|aileye uygun|aile dostu|ailece|aile tatili|kids? friendly|family friendly|for kids|for families)\b/,
    words: /^(cocuk\w*|dostu|aile\w*|ailece|uygun|tatil\w*|kids?|family|families|friendly|for)$/,
    amenity: /cocuk havuz|cocuk kulub|mini ?club|junior club|animasyon|oyun alan|aquapark|aqua park|kaydirak|cocuk bufe|bebek/,
    familyRooms: true,
    min: 2,
  },
  {
    key: "balayi",
    label: "Balayı",
    phrase: "balayına uygun",
    textLabel: "Balayı konsepti (otel açıklamasında)",
    ask: /\b(balayi\w*|romantik|honeymoon|romantic|ciftler icin|sevgilimle|esimle)\b/,
    words: /^(balayi\w*|romantik|honeymoon|romantic|ciftler|sevgilimle|esimle|icin)$/,
    amenity: /jakuzi|spa|masaj|a la carte|oda servis|cilt|aromaterapi/,
    text: /balayi/,
    // Termal otellerin çoğunda spa/masaj/jakuzi var: metin kanıtı yoksa çok güçlü kanıt gerekir.
    min: 5,
  },
  {
    key: "spa-kur",
    label: "Spa ve şifa",
    phrase: "spa ve şifa odaklı",
    ask: /\b(sifa\w*|kur|kur tatili|tedavi\w*|wellness|saglik\w*|spa agirlikli|dinlenme|healing|rehabilitation)\b/,
    words: /^(sifa\w*|kur|tedavi\w*|wellness|saglik\w*|agirlikli|dinlenme|healing|rehabilitation|tatili)$/,
    amenity: /spa|masaj|sauna|hamam|buhar|cilt|doktor|fizik|aromaterapi|termal havuz/,
    min: 4,
  },
];

/** Otelin bir kavram için kanıtları (en güçlüsü önce). */
export function conceptEvidence(hotel: SearchIndexHotel, key: ConceptKey): string[] {
  const concept = CONCEPTS.find((c) => c.key === key)!;
  const evidence = hotel.amenities.filter((a) => concept.amenity.test(normalizeText(a)));
  if (concept.familyRooms) {
    const room = hotel.rooms.find((r) => /aile|family/i.test(r.name) || r.capacityAdults + r.capacityChildren >= 4);
    if (room) evidence.push(room.name);
  }
  const textHit = concept.text && hotel.texts.some((t) => concept.text!.test(normalizeText(t)));
  return textHit ? [concept.textLabel ?? `${concept.label} (otel açıklamasında)`, ...evidence] : evidence;
}

function conceptQualifies(hotel: SearchIndexHotel, key: ConceptKey, evidence: string[]): boolean {
  const concept = CONCEPTS.find((c) => c.key === key)!;
  const textHit = concept.text && hotel.texts.some((t) => concept.text!.test(normalizeText(t)));
  return Boolean(textHit) || evidence.length >= concept.min;
}

/** Yazım hatası düzeltmede kullanılan arama kelimeleri (normalize). */
const SEARCH_VOCABULARY = [
  "fitness", "spor", "salonu", "hamam", "hamami", "sauna", "jakuzi", "jakuzili", "otopark", "asansor", "restoran",
  "restaurant", "havuz", "havuzu", "havuzlu", "kapali", "termal", "cocuk", "kulubu", "animasyon", "masaj", "aquapark",
  "kaydirakli", "klima", "minibar", "balkon", "televizyon", "camasirhane", "toplanti", "kuafor", "doktor", "bilardo",
  "tenis", "internet", "kablosuz", "pansiyon", "kahvalti", "yetiskin", "kisilik", "evcil", "hayvan", "kopek",
  "havalimani", "havaalani", "havalimanina", "yildizli", "dahil", "aile", "odasi",
];

/** Türkçe ekler: yazım hatası ekli kelimede de bulunsun ("pamukalede" → "pamukkalede"). */
const TYPO_SUFFIXES = ["daki", "deki", "nda", "nde", "da", "de", "ta", "te", "li", "lu", "si", "su", "na", "ne", "i", "u"];

/**
 * Sözlükte ya da şehir listesinde olmayan kelimeyi en yakın karşılığına düzeltir.
 * 5 harften kısa kelimelere dokunmaz; iki aday eşit yakınsa tahmin etmez.
 */
export function correctTypos(query: string, placeNames: string[]): { text: string; corrections: Array<{ from: string; to: string }> } {
  const vocabulary = new Set([...SEARCH_VOCABULARY, ...KNOWN_AMENITY_WORDS, ...placeNames.filter((p) => !p.includes(" "))]);
  const corrections: Array<{ from: string; to: string }> = [];
  const isKnown = (word: string) =>
    vocabulary.has(word) ||
    FILLER.has(word) ||
    isKnownAmenityWord(stripWith(word)) ||
    tokens(canonicalAmenityText(word)).join(" ") !== word ||
    placeNames.some((place) => placeMatch(word, place)) ||
    [...vocabulary].some((v) => v.length >= 5 && suffixMatch(word, v));
  const words = normalizeText(query.replace(/[’'`]/g, " ")).split(" ");
  const fixed = words.map((word) => {
    if (word.length < 5 || /\d/.test(word) || isKnown(word)) return word;
    const direct = closestWord(word, vocabulary);
    let fix = direct;
    if (!fix) {
      for (const suffix of TYPO_SUFFIXES) {
        if (!word.endsWith(suffix) || word.length - suffix.length < 5) continue;
        const base = closestWord(word.slice(0, -suffix.length), vocabulary);
        if (base) {
          fix = base + suffix;
          break;
        }
      }
    }
    if (!fix) return word;
    corrections.push({ from: word, to: fix });
    return fix;
  });
  return { text: fixed.join(" "), corrections };
}

export function parseSearchQuery(rawQuery: string, placeNames: string[]): ParsedSearch {
  const { text: query, corrections } = correctTypos(rawQuery, placeNames);
  const normalized = normalizeText(query);
  const canonicalTokens = tokens(canonicalAmenityText(query)).map(stripWith);
  const used = new Set<string>();

  // Olanaklar: bilinen olanak kelimesi + önündeki niteleyici ("çocuk havuzu").
  const amenities: ParsedSearch["amenities"] = [];
  canonicalTokens.forEach((token, i) => {
    if (!isKnownAmenityWord(token)) return;
    const prev = canonicalTokens[i - 1];
    const phrase = prev && AMENITY_MODIFIERS.has(prev) ? `${prev} ${token}` : token;
    if (!amenities.some((a) => a.phrase === phrase)) amenities.push({ phrase, label: display(phrase) });
    used.add(token);
    if (prev && AMENITY_MODIFIERS.has(prev)) used.add(prev);
  });

  // Yerler: sorgudaki kelime bir şehir/ilçe adıyla eşleşiyor mu ("afyon da" → afyon).
  const places: string[] = [];
  for (const token of tokens(normalized)) {
    // Genel kelimeler ("termal", "otel") yer adı sayılmaz — Yalova'da "Termal" ilçesi olsa da.
    if (FILLER.has(token) || isKnownAmenityWord(stripWith(token))) continue;
    const aliases = PLACE_ALIASES[token] ?? [token];
    const hits = placeNames.filter((place) => aliases.some((a) => placeMatch(a, place)));
    if (hits.length) {
      // Kısaltma ("afyon") → hem kısa hem uzun ad; ekli kelime ("denizlideki") → yer adı.
      for (const name of PLACE_ALIASES[token] ? aliases : hits) if (!places.includes(name)) places.push(name);
      used.add(token);
    }
  }

  const pets = /\b(evcil|kopek|kedi|pets?|dogs?|cats?)/.test(normalized);
  if (pets) tokens(normalized).filter((t) => /^(evcil|hayvan|kopek|kedi|pet|dog|cat)/.test(t)).forEach((t) => used.add(t));

  const guestDetails = parseGuests(query);
  const kisilik = normalized.match(/\b(\d{1,2}) ?kisilik\b/)?.[1];
  const guests = kisilik ? Number(kisilik) : (guestDetails.guestCount ?? null);
  if (guests) tokens(normalized).filter((t) => /^\d+$/.test(t)).forEach((t) => used.add(t));
  const familyRoom = /\b(aile odasi|aile odali|family room)/.test(normalized);

  const board: Board | null = /\b(her ?sey dahil|all inclusive)/.test(normalized)
    ? "hersey-dahil"
    : /\b(tam pansiyon|full board)/.test(normalized)
      ? "tam-pansiyon"
      : /\b(yarim pansiyon|half board)/.test(normalized)
        ? "yarim-pansiyon"
        : /\b(kahvalti dahil|oda kahvalti|breakfast included|with breakfast)/.test(normalized)
          ? "kahvalti-dahil"
          : null;
  if (board) tokens(normalized).filter((t) => /^(her|sey|hersey|tam|yarim|kahvalti|full|half|board|all|inclusive)$/.test(t)).forEach((t) => used.add(t));

  const nearAirport = /\b(havaliman\w*|havaalan\w*|airport)/.test(normalized);
  if (nearAirport) tokens(normalized).filter((t) => /^(havaliman|havaalan|airport)/.test(t)).forEach((t) => used.add(t));

  const stars = normalized.match(/\b([1-5]) ?(yildiz\w*|stars?)\b/)?.[1];
  const minStars = stars ? Number(stars) : null;
  if (stars) used.add(stars);

  const concepts = CONCEPTS.filter((c) => c.ask.test(normalized)).map((c) => c.key);
  for (const key of concepts) {
    const concept = CONCEPTS.find((c) => c.key === key)!;
    tokens(normalized).filter((t) => concept.words.test(t)).forEach((t) => used.add(t));
  }

  // Sözlükteki çok kelimeli ifadelerin kelimeleri ("denize sıfır") anlaşılmış sayılır.
  const phraseWords = canonicalSourceWords(query);
  const unknown = tokens(normalized).filter(
    (t) => !used.has(t) && !phraseWords.has(t) && !FILLER.has(t) && !/^\d+$/.test(t) && !isKnownAmenityWord(stripWith(t)) && !tokens(canonicalAmenityText(t)).some((c) => [...used].some((u) => u === c || suffixMatch(c, u))),
  );

  // Misafire kendi yazdığı haliyle gösterilir ("manzarali" değil "manzaralı").
  const original = new Map(
    rawQuery
      .replace(/[’'`]/g, " ")
      .split(/\s+/)
      .flatMap((word) => tokens(word).map((t) => [t, word.replace(/[^\p{L}\p{N}]/gu, "").toLocaleLowerCase("tr-TR")] as const)),
  );
  const shown = unknown.map((t) => original.get(t) || t);

  return { amenities, places, pets, guests, familyRoom, board, nearAirport, minStars, concepts, unknown: shown, corrections };
}

// ---------------------------------------------------------------------------
// Eşleştirme
// ---------------------------------------------------------------------------

const BOARD_LABELS: Record<Board, string> = {
  "kahvalti-dahil": "Kahvaltı dahil",
  "yarim-pansiyon": "Yarım pansiyon",
  "tam-pansiyon": "Tam pansiyon",
  "hersey-dahil": "Her şey dahil",
};

/** Yakın kabul edilen en uzak havalimanı mesafesi. */
const NEAR_AIRPORT_KM = 50;

function hotelPlaces(hotel: SearchIndexHotel): string[] {
  return [hotel.city, ...(hotel.address ?? "").split(/[/,]/)]
    .filter((x): x is string => Boolean(x?.trim()))
    .map((x) => normalizeText(x));
}

function evaluate(hotel: SearchIndexHotel, query: ParsedSearch): SearchResult {
  const matched: string[] = [];
  const missing: string[] = [];

  for (const amenity of query.amenities) {
    const labels = matchAmenities(amenity.phrase, hotel.amenities);
    if (labels.length) matched.push(labels.slice(0, 3).join(", "));
    else if (textsMentionAmenity(amenity.phrase, hotel.texts)) matched.push(`${amenity.label} (otel açıklamasında)`);
    else missing.push(amenity.label);
  }

  if (query.places.length) {
    const places = hotelPlaces(hotel);
    const place = places.find((p) => query.places.some((q) => placeMatch(q, p) || p === q));
    if (place) matched.push([hotel.city, hotel.address].find((x) => x && normalizeText(x).includes(place)) ?? place);
    else {
      const place = query.places.at(-1)!;
      missing.push(`${place.charAt(0).toLocaleUpperCase("tr-TR")}${place.slice(1)}`);
    }
  }

  if (query.pets) {
    if (hotel.petsAllowed === true) matched.push("Evcil hayvan kabul edilir");
    else missing.push(hotel.petsAllowed === false ? "evcil hayvan (kabul edilmiyor)" : "evcil hayvan (bilgi yok)");
  }

  if (query.guests || query.familyRoom) {
    const room = hotel.rooms.find(
      (r) =>
        (!query.guests || r.capacityAdults + r.capacityChildren >= query.guests) &&
        (!query.familyRoom || /aile|family/i.test(r.name) || r.capacityAdults + r.capacityChildren >= 4),
    );
    if (room) matched.push(`${room.name} (${room.capacityAdults} yetişkin${room.capacityChildren ? ` + ${room.capacityChildren} çocuk` : ""})`);
    else missing.push(query.familyRoom ? "aile odası" : `${query.guests} kişilik oda`);
  }

  if (query.board) {
    const label = BOARD_LABELS[query.board];
    const ok = hotel.rooms.some((r) => r.boardType === query.board) || hotel.amenities.some((a) => normalizeText(a).startsWith(normalizeText(label)));
    (ok ? matched : missing).push(label);
  }

  if (query.nearAirport) {
    if (hotel.airportKm != null && hotel.airportKm <= NEAR_AIRPORT_KM) matched.push(`Havalimanına ${hotel.airportKm} km`);
    else missing.push(hotel.airportKm != null ? `havalimanına yakın (${hotel.airportKm} km)` : "havalimanı mesafesi (bilgi yok)");
  }

  if (query.minStars) {
    if ((hotel.starRating ?? 0) >= query.minStars) matched.push(`${hotel.starRating} yıldız`);
    else missing.push(`${query.minStars} yıldız`);
  }

  let conceptScore = 0;
  for (const key of query.concepts) {
    const label = CONCEPTS.find((c) => c.key === key)!.label;
    const evidence = conceptEvidence(hotel, key);
    if (conceptQualifies(hotel, key, evidence)) {
      // Otelin kendi metninde açıkça geçen kavram ("Balayı Konsepti") en güçlü kanıttır.
      const textHit = CONCEPTS.find((c) => c.key === key)!.text?.test(normalizeText(hotel.texts.join(" ")));
      conceptScore += evidence.length + (textHit ? 10 : 0);
      matched.push(`${label}: ${evidence.slice(0, 4).join(", ")}${evidence.length > 4 ? ` +${evidence.length - 4}` : ""}`);
    } else {
      missing.push(`${label.toLocaleLowerCase("tr-TR")} (yeterli bilgi yok)`);
    }
  }

  return { slug: hotel.slug, name: hotel.name, city: hotel.city, imageUrl: hotel.imageUrl, matched, missing, airportKm: hotel.airportKm, conceptScore };
}

function criteriaCount(query: ParsedSearch): number {
  return (
    query.amenities.length +
    (query.places.length ? 1 : 0) +
    (query.pets ? 1 : 0) +
    (query.guests || query.familyRoom ? 1 : 0) +
    (query.board ? 1 : 0) +
    (query.nearAirport ? 1 : 0) +
    (query.minStars ? 1 : 0) +
    query.concepts.length
  );
}

const PARTIAL_LIMIT = 6;

/**
 * context: önceki aramalar (eskiden yeniye). Yeni cümle takip sorusuysa
 * onlarla birleşir; değilse yeni arama başlar. Dönen `chain` bir sonraki
 * takip için bağlamdır.
 */
export function searchHotels(
  query: string,
  index: SearchIndexHotel[],
  context: string[] = [],
  /** Önceden yorumlanmış istek (ör. model yorumu eklenmiş) — verilirse ayrıştırma atlanır. */
  parsedOverride?: ParsedSearch,
): SearchResponse {
  const placeNames = [...new Set(index.flatMap(hotelPlaces))];
  const chain = context.length && isFollowUp(query) ? [...context, query] : [query];
  const parsed = parsedOverride ?? chain.map((q) => parseSearchQuery(q, placeNames)).reduce((acc, next) => mergeSearches(acc, next));
  const total = criteriaCount(parsed);
  const unknownNote =
    (parsed.corrections.length ? ` (${parsed.corrections.map((c) => `“${c.from}” → “${c.to}”`).join(", ")} olarak anladım.)` : "") +
    (parsed.unknown.length ? ` Şunları anlayamadım: ${parsed.unknown.map((u) => `“${u}”`).join(", ")}.` : "");

  if (!total) {
    return {
      query: parsed,
      chain,
      results: [],
      partial: [],
      summary: `Ne aradığınızı anlayamadım.${unknownNote} Örneğin “Afyon'da çocuk havuzu olan otel” ya da “evcil hayvan kabul eden otel” yazabilirsiniz.`,
    };
  }

  const evaluated = index.map((hotel) => evaluate(hotel, parsed));
  // Sıra: havalimanı sorulduysa mesafe; kavram sorulduysa kanıt sayısı; sonra ad.
  const byAirport = (a: SearchResult, b: SearchResult) =>
    parsed.nearAirport
      ? (a.airportKm ?? 9_999) - (b.airportKm ?? 9_999)
      : b.conceptScore - a.conceptScore || a.name.localeCompare(b.name, "tr");
  const results = evaluated.filter((r) => r.missing.length === 0).sort(byAirport);
  const partial = results.length
    ? []
    : evaluated
        .filter((r) => r.matched.length > 0)
        .sort((a, b) => b.matched.length - a.matched.length || byAirport(a, b))
        .slice(0, PARTIAL_LIMIT);

  // Özette yerin özgün yazımı ("Nigde" değil "Niğde").
  const placeDisplay = new Map(index.flatMap((h) => [h.city, ...(h.address ?? "").split(/[/,]/)]).filter((x): x is string => Boolean(x?.trim())).map((x) => [normalizeText(x), x.trim()]));
  const wanted = describeQuery(parsed, placeDisplay);
  const closest = parsed.nearAirport && results[0]?.airportKm != null ? ` En yakını: ${results[0].name} (${results[0].airportKm} km).` : "";
  const summary = results.length
    ? `${wanted} ${results.length} otel buldum.${closest}${unknownNote}`
    : partial.length
      ? `${wanted} otel bulamadım; isteklerinizin bir kısmına uyan ${partial.length} otel aşağıda.${unknownNote}`
      : `${wanted} otel bulamadım.${unknownNote}`;
  return { query: parsed, chain, results, partial, summary };
}

/** "Çocuk havuzu olan, Afyon'da" gibi okunur istek özeti. */
function describeQuery(query: ParsedSearch, placeDisplay: Map<string, string> = new Map()): string {
  const parts: string[] = [];
  if (query.amenities.length) parts.push(`${query.amenities.map((a) => a.label).join(", ")} olan`);
  if (query.pets) parts.push("evcil hayvan kabul eden");
  if (query.familyRoom) parts.push("aile odası olan");
  else if (query.guests) parts.push(`${query.guests} kişilik odası olan`);
  if (query.board) parts.push(BOARD_LABELS[query.board].toLocaleLowerCase("tr-TR"));
  if (query.nearAirport) parts.push(`havalimanına ${NEAR_AIRPORT_KM} km'den yakın`);
  if (query.minStars) parts.push(`en az ${query.minStars} yıldızlı`);
  for (const key of query.concepts) parts.push(CONCEPTS.find((c) => c.key === key)!.phrase);
  if (query.places.length) {
    const place = query.places.at(-1)!;
    parts.push(`${placeDisplay.get(place) ?? `${place.charAt(0).toLocaleUpperCase("tr-TR")}${place.slice(1)}`} bölgesinde`);
  }
  const text = parts.join(", ");
  return text.charAt(0).toLocaleUpperCase("tr-TR") + text.slice(1);
}

/** Otel metinlerinden en yakın havalimanı mesafesi ("Zafer Havaalanına 37 km"). */
export function airportDistanceFromTexts(texts: string[]): number | null {
  const distances = texts.flatMap((text) =>
    [...text.matchAll(/hava(?:alan|liman)\S*\s*(?:na|ne)?\s*[:-]?\s*(\d{1,3}(?:[.,]\d)?)\s*(?:km|kilomet)/gi)].map((m) =>
      Number(m[1]!.replace(",", ".")),
    ),
  );
  return distances.length ? Math.min(...distances) : null;
}

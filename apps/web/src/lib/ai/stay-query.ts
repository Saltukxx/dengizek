// ---------------------------------------------------------------------------
// Konaklama sorgusu çıkarımı — misafir mesajından tarih, gece ve kişi bilgisi.
//
// İlke: emin olunmayan hiçbir şey tahminle doldurulmaz. Mesajda tarih ipucu
// var ama çözülemiyorsa (ör. "bayramda", "gelecek hafta", çelişen gece
// sayısı) sonuç `needsClarification` ile döner ve rehber tarihi sorar —
// misafire yanlış tarihin ya da bugünün fiyatı gösterilmez.
// ---------------------------------------------------------------------------

import { normalizeText } from "@/lib/ai/text";

// ---------------------------------------------------------------------------
// Tarih yardımcıları (tümü UTC takvim günü, YYYY-MM-DD)
// ---------------------------------------------------------------------------

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function isoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000);
}

/** Yıl verilmemişse: bu yıl; tarih bugünden önceyse gelecek yıl. */
function withYear(month: number, day: number, year: number | null, today: string): string | null {
  if (year) return isoDate(year, month, day);
  const thisYear = Number(today.slice(0, 4));
  const candidate = isoDate(thisYear, month, day);
  if (candidate && candidate >= today) return candidate;
  return isoDate(thisYear + 1, month, day);
}

/** 0 = pazar … 6 = cumartesi */
function dayOfWeek(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/** Bugünden sonraki ilk `target` günü (1..7 gün ileri). */
function nextWeekday(from: string, target: number): string {
  const diff = (target - dayOfWeek(from) + 7) % 7 || 7;
  return addDays(from, diff);
}

/** Gelecek takvim haftasındaki (pazartesi başlangıçlı) `target` günü. */
function weekdayNextWeek(today: string, target: number): string {
  const mondayThisWeek = addDays(today, -((dayOfWeek(today) + 6) % 7));
  return addDays(mondayThisWeek, 7 + ((target + 6) % 7));
}

// ---------------------------------------------------------------------------
// Sözcükler
// ---------------------------------------------------------------------------

const TR_MONTHS = [
  "ocak", "subat", "mart", "nisan", "mayis", "haziran",
  "temmuz", "agustos", "eylul", "ekim", "kasim", "aralik",
];

/** İngilizce ay adları ve kısaltmaları — yalnız TAM kelime eşleşir ("junior" ≠ June). */
const EN_MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

/** Gün numarasının yanındaki ay kelimesi: Türkçe ad (+ek) ya da İngilizce ad. */
export function monthFromWord(word: string): number | null {
  if (EN_MONTHS[word]) return EN_MONTHS[word]!;
  const index = TR_MONTHS.findIndex((m) => word.startsWith(m));
  return index >= 0 ? index + 1 : null;
}

/** Gün numarası olmadan geçen ay ("Temmuzda", "in July"). Belirsiz kelimeler elenir. */
const TR_MONTH_ONLY_SUFFIX =
  /^(|da|de|ta|te|dan|den|tan|ten|a|e|ya|ye|in|un|nin|nun|i|u|ayi|ayinda|ayindan|ayina|sonu|basi|ortasi)$/;
const EN_MONTH_ONLY = new Set([
  "january", "february", "march", "april", "june", "july", "august",
  "september", "october", "november", "december",
]);

const NUMBER_WORDS: Record<string, number> = {
  tek: 1, bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};
const NUM = String.raw`(\d{1,2}|${Object.keys(NUMBER_WORDS).join("|")})`;

function toNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = /^\d+$/.test(value) ? Number(value) : NUMBER_WORDS[value];
  return n && n > 0 ? n : undefined;
}

/** Bir gün numarasının ardından gelirse onu TARİH değil SAYI yapan kelimeler. */
const COUNT_NOUNS = String.raw`(?:kisi|kisilik|yetiskin|cocuk|bebek|gece|gecelik|night|nights|people|persons?|guests?|adults?|child|children|kids?|yas|yasinda|years?|oda|rooms?|pax|hafta|weeks?|gun|days?|saat|km|dk|dakika|minutes?|hours?|metre|m)\b`;

// ---------------------------------------------------------------------------
// Açık tarih kalıpları
// ---------------------------------------------------------------------------

// Kesme işaretinden sonraki Türkçe ekler: "10'unda", "13'e", "15'inden".
const DAY_SUFFIX = String.raw`(?:\s+(?:u|i|a|e|ya|ye|si|su|da|de|ta|te|dan|den|tan|ten|una|une|ina|ine|unda|unde|inda|inde|undan|unden|indan|inden|nda|nde|ndan|nden|uncu|inci|ncu|nci))?`;
const DAY = String.raw`\b(\d{1,2})(?:st|nd|rd|th)?${DAY_SUFFIX}`;
const OF = String.raw`(?:\s+of)?`;
const MONTH = String.raw`([a-z]+)`;
const YEAR = String.raw`(?:\s+(\d{4}))?`;
const SEP = String.raw`\s*\b(?:ile|ila|to|until|till|through|thru|and|ve|dan|den|tan|ten|giris\w*|cikis\w*|checkout|checkin)\b\s*`;
// Gün numarasından sonra sayı ismi ("13 kişi") ya da saat dakikası ("15 00") gelmemeli; 4 haneli yıl serbest.
const NOT_COUNT = String.raw`(?!\s*${COUNT_NOUNS})(?!\s+\d{2}\b(?!\s*${COUNT_NOUNS}))`;

type DatePair = { checkIn: string; checkOut?: string; outYearGiven?: boolean };

/** İlk geçerli eşleşmeyi döndürür (ay adı olmayan "2 kişi" gibi eşleşmeleri atlar). */
function firstMatch(text: string, pattern: string, build: (m: RegExpMatchArray) => DatePair | null): DatePair | null {
  for (const m of text.matchAll(new RegExp(pattern, "g"))) {
    const value = build(m);
    if (value) return value;
  }
  return null;
}

function numericDates(raw: string, today: string): DatePair | null {
  const found: Array<{ index: number; iso: string; yearGiven: boolean }> = [];
  for (const m of raw.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) {
    const iso = isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
    if (iso) found.push({ index: m.index!, iso, yearGiven: true });
  }
  for (const m of raw.matchAll(/\b(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2})\b/g)) {
    const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const iso = isoDate(year, Number(m[2]), Number(m[1]));
    if (iso) found.push({ index: m.index!, iso, yearGiven: true });
  }
  // Yılsız gün.ay — ay iki haneli olmalı ("10.08"); "2.5 km", "14.00" gibi
  // sayılar tarih sayılmaz.
  for (const m of raw.matchAll(/(?<![\d./])(\d{1,2})[./](\d{2})(?![\d./])(?!\s*(?:km|m\b|metre|saat|dk|dakika|%))/g)) {
    const month = Number(m[2]);
    if (month < 1 || month > 12) continue;
    const iso = withYear(month, Number(m[1]), null, today);
    if (iso) found.push({ index: m.index!, iso, yearGiven: false });
  }
  if (!found.length) return null;
  found.sort((a, b) => a.index - b.index);
  const [first, second] = found;
  if (!second) return { checkIn: first!.iso };
  let checkOut = second.iso;
  // Yılsız ikinci tarih ilk tarihin yılına bağlanır ("28.12 - 02.01" → ertesi yıl).
  if (!second.yearGiven) {
    const sameYear = isoDate(Number(first!.iso.slice(0, 4)), Number(checkOut.slice(5, 7)), Number(checkOut.slice(8, 10)));
    if (sameYear) checkOut = sameYear;
  }
  return { checkIn: first!.iso, checkOut, outYearGiven: second.yearGiven };
}

function textDates(text: string, today: string): DatePair | null {
  // "10 agustos - 13 eylul 2026", "giris 10 agustos cikis 15 agustos"
  return (
    firstMatch(text, `${DAY}${OF}\\s+${MONTH}${YEAR}${DAY_SUFFIX}(?:${SEP}|\\s+)${DAY}${OF}\\s+${MONTH}${YEAR}`, (m) => {
      const m1 = monthFromWord(m[2]!);
      const m2 = monthFromWord(m[5]!);
      if (!m1 || !m2) return null;
      const outYear = m[6] ? Number(m[6]) : null;
      const checkIn = withYear(m1, Number(m[1]), m[3] ? Number(m[3]) : outYear, today);
      if (!checkIn) return null;
      const checkOut = isoDate(outYear ?? Number(checkIn.slice(0, 4)), m2, Number(m[4]));
      return checkOut ? { checkIn, checkOut, outYearGiven: Boolean(outYear) } : null;
    }) ??
    // "10-13 agustos 2026", "10 ile 13 agustos arasi"
    firstMatch(text, `${DAY}${SEP}${DAY}${OF}\\s+${MONTH}${YEAR}`, (m) => {
      const month = monthFromWord(m[3]!);
      if (!month) return null;
      const checkIn = withYear(month, Number(m[1]), m[4] ? Number(m[4]) : null, today);
      if (!checkIn) return null;
      const checkOut = isoDate(Number(checkIn.slice(0, 4)), month, Number(m[2]));
      return checkOut ? { checkIn, checkOut } : null;
    }) ??
    // "august 10 to 13", "aug 28 - sep 2 2026"
    firstMatch(text, `${MONTH}\\s+${DAY}${SEP}(?:${MONTH}\\s+)?${DAY}${NOT_COUNT}${YEAR}`, (m) => {
      const m1 = monthFromWord(m[1]!);
      const m2 = m[3] ? monthFromWord(m[3]) : m1;
      if (!m1 || !m2) return null;
      if (!m[3] && Number(m[4]) <= Number(m[2])) return null; // "june 5 to 2" tarih aralığı değil
      const year = m[5] ? Number(m[5]) : null;
      const checkIn = withYear(m1, Number(m[2]), year, today);
      if (!checkIn) return null;
      const checkOut = isoDate(year ?? Number(checkIn.slice(0, 4)), m2, Number(m[4]));
      return checkOut ? { checkIn, checkOut, outYearGiven: Boolean(year) } : null;
    }) ??
    // "10 agustostan 15 ine kadar", "10 agustos ile 15 arasi" → aynı ay
    firstMatch(text, `${DAY}${OF}\\s+${MONTH}${YEAR}${DAY_SUFFIX}(${SEP}|\\s+)${DAY}${NOT_COUNT}(\\s+(?:kadar|until|till|arasi|cikis\\w*|checkout))?`, (m) => {
      const month = monthFromWord(m[2]!);
      if (!month) return null;
      const linked = m[4]!.trim().length > 0 || /(dan|den|tan|ten)$/.test(m[2]!) || Boolean(m[6]);
      if (!linked || Number(m[5]) <= Number(m[1])) return null;
      const checkIn = withYear(month, Number(m[1]), m[3] ? Number(m[3]) : null, today);
      if (!checkIn) return null;
      const checkOut = isoDate(Number(checkIn.slice(0, 4)), month, Number(m[5]));
      return checkOut ? { checkIn, checkOut } : null;
    }) ??
    // Tek tarih: "15 temmuz", "15th of july"
    firstMatch(text, `${DAY}${OF}\\s+${MONTH}${YEAR}`, (m) => {
      const month = monthFromWord(m[2]!);
      const checkIn = month ? withYear(month, Number(m[1]), m[3] ? Number(m[3]) : null, today) : null;
      return checkIn ? { checkIn } : null;
    }) ??
    // "july 15", "july 15th 2027"
    firstMatch(text, `${MONTH}(?:\\s+(?:un|in|nun|nin|ayinin))?\\s+${DAY}${NOT_COUNT}${YEAR}`, (m) => {
      const month = monthFromWord(m[1]!);
      const checkIn = month ? withYear(month, Number(m[2]), m[3] ? Number(m[3]) : null, today) : null;
      return checkIn ? { checkIn } : null;
    })
  );
}

/** Ay adının yanında takvimde olmayan bir gün var mı? ("31 şubat", "february 30") */
function hasInvalidDayMonth(text: string): boolean {
  for (const re of [new RegExp(`${DAY}${OF}\\s+${MONTH}`, "g"), new RegExp(`${MONTH}\\s+${DAY}${NOT_COUNT}`, "g")]) {
    for (const m of text.matchAll(re)) {
      const [day, word] = /^\d/.test(m[1]!) ? [Number(m[1]), m[2]!] : [Number(m[2]), m[1]!];
      const month = monthFromWord(word);
      if (month && !isoDate(2028, month, day)) return true; // 2028 artık yıl: 29 Şubat geçerli sayılır
    }
  }
  return false;
}

/** Gün olmadan anılan ay: "Temmuzda fiyat?" → { month: "2027-07" }. */
function monthOnly(text: string, today: string): string | null {
  const words = text.split(" ");
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i]!;
    const prev = words[i - 1] ?? "";
    let month: number | null = null;
    const tr = TR_MONTHS.findIndex((m) => word.startsWith(m) && TR_MONTH_ONLY_SUFFIX.test(word.slice(m.length)));
    // "aralık" aynı zamanda "aralık/aralığı" (range) demek: "fiyat aralıkta" ay değildir.
    if (tr >= 0 && !(tr === 11 && /^(fiyat\w*|yas\w*|tarih\w*|saat\w*)$/.test(prev))) month = tr + 1;
    if (!month && EN_MONTH_ONLY.has(word)) month = EN_MONTHS[word]!;
    // "may" İngilizcede fiil de olabilir: yalnız "in/during/this/next may".
    if (!month && word === "may" && /^(in|during|this|next|early|late|mid)$/.test(prev)) month = 5;
    if (!month) continue;
    const year = /^\d{4}$/.test(words[i + 1] ?? "") ? Number(words[i + 1]) : null;
    const thisYear = Number(today.slice(0, 4));
    const currentMonth = Number(today.slice(5, 7));
    const resolvedYear = year ?? (month < currentMonth ? thisYear + 1 : thisYear);
    return `${resolvedYear}-${pad(month)}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Göreli tarihler: "yarın", "cumadan pazara", "haftaya cuma", "next friday"
// ---------------------------------------------------------------------------

/** 0 = pazar … 6 = cumartesi — Türkçe ekleri (cumaya, salıdan) kabul eder. */
const WEEKDAYS: Array<[number, RegExp]> = [
  [1, /\b(?:pazartesi\w*|monday)\b/g],
  [2, /\b(?:sali(?:ya|dan|da|yi|ye|ki|nin)?|tuesday)\b/g],
  [3, /\b(?:carsamba\w*|wednesday)\b/g],
  [4, /\b(?:persembe\w*|thursday)\b/g],
  [5, /\b(?:cuma(?!rtesi)\w*|friday)\b/g],
  [6, /\b(?:cumartesi\w*|saturday)\b/g],
  [0, /\b(?:pazar(?!tesi|lik|lig)\w*|sunday)\b/g],
];

const NEXT_WEEK_BEFORE = /\b(haftaya|gelecek hafta(?:ki)?|onumuzdeki hafta(?:ki)?|next)\s+$/;
const THIS_BEFORE = /\b(bu|this)\s+$/;

interface Anchor {
  index: number;
  date: string;
  weekday?: number;
  /** "pazara kadar", "until sunday": tek başına çıkış günü */
  until?: boolean;
}

function relativeAnchors(text: string, today: string): Anchor[] {
  const anchors: Anchor[] = [];
  for (const m of text.matchAll(/\b(?:bugun\w*|bu gece|bu aksam|today|tonight)\b/g)) {
    anchors.push({ index: m.index!, date: today });
  }
  for (const m of text.matchAll(/\b(?:yarindan sonra\w*|obur gun\w*|day after tomorrow)\b/g)) {
    anchors.push({ index: m.index!, date: addDays(today, 2) });
  }
  for (const m of text.matchAll(/\b(?:yarin\w*|tomorrow)\b/g)) {
    if (/^yarindan sonra/.test(text.slice(m.index!)) || /after $/.test(text.slice(0, m.index!))) continue;
    anchors.push({ index: m.index!, date: addDays(today, 1) });
  }
  for (const m of text.matchAll(new RegExp(String.raw`\b${NUM}\s+(gun|hafta)\s+sonra\b|\bin\s+${NUM}\s+(days?|weeks?)\b`, "g"))) {
    const n = toNumber(m[1] ?? m[3]);
    if (!n) continue;
    const unit = m[2] ?? m[4] ?? "";
    anchors.push({ index: m.index!, date: addDays(today, /^(hafta|week)/.test(unit) ? n * 7 : n) });
  }
  for (const [weekday, re] of WEEKDAYS) {
    for (const m of text.matchAll(re)) {
      const before = text.slice(Math.max(0, m.index! - 30), m.index!);
      const word = m[0]!;
      let date: string;
      if (NEXT_WEEK_BEFORE.test(before)) date = weekdayNextWeek(today, weekday);
      else if (THIS_BEFORE.test(before) && dayOfWeek(today) === weekday) date = today;
      else date = nextWeekday(today, weekday);
      const after = text.slice(m.index! + word.length);
      const until =
        (/(a|e|ya|ye)$/.test(word) && /^\s+kadar\b/.test(after)) || /\b(until|till)\s+$/.test(before);
      anchors.push({ index: m.index!, date, weekday, until });
    }
  }
  return anchors.sort((a, b) => a.index - b.index);
}

function relativeStay(text: string, today: string): { pair: DatePair | null; ambiguous: boolean } {
  const weekend = text.match(/\b(?:hafta ?sonu\w*|weekend)\b/);
  if (weekend) {
    // Hafta sonu = cuma girişi, pazar çıkışı (2 gece).
    const before = text.slice(0, weekend.index!);
    const nextWeek = /\b(haftaya|gelecek|onumuzdeki|next)\s+$/.test(before);
    const dow = dayOfWeek(today);
    let friday: string;
    if (nextWeek) friday = weekdayNextWeek(today, 5);
    else if (dow === 5 || dow === 6) friday = dow === 5 ? today : addDays(today, -1);
    else friday = nextWeekday(today, 5);
    const checkIn = friday < today ? today : friday;
    return { pair: { checkIn, checkOut: addDays(friday, 2) }, ambiguous: false };
  }

  const anchors = relativeAnchors(text, today);
  if (!anchors.length) return { pair: null, ambiguous: false };
  const [first, second] = anchors;

  if (second) {
    // "yarın veya cuma" bir aralık değil, iki seçenek.
    const between = text.slice(first!.index, second.index);
    if (/\b(veya|ya da|yahut|or)\b/.test(between)) return { pair: null, ambiguous: true };
    // Aralık işareti şart: "cumadan pazara", "cuma - pazar", "from friday to sunday".
    // "Cumartesi ve pazar" iki gece mi, tek gece mi belli değil → sorulur.
    const firstWord = between.split(" ")[0] ?? "";
    const isRange =
      /(dan|den|tan|ten)$/.test(firstWord) ||
      /\b(ila|to|until|till|through|thru)\b/.test(between) ||
      /^\s+kadar\b/.test(text.slice(second.index).replace(/^\S+/, ""));
    if (!isRange) return { pair: null, ambiguous: true };
    const checkIn = first!.date;
    const checkOut = second.weekday != null && second.date <= checkIn ? nextWeekday(checkIn, second.weekday) : second.date;
    if (checkOut <= checkIn) return { pair: null, ambiguous: true };
    return { pair: { checkIn, checkOut }, ambiguous: false };
  }
  if (first!.until) {
    if (first!.date <= today) return { pair: null, ambiguous: true };
    return { pair: { checkIn: today, checkOut: first!.date }, ambiguous: false };
  }
  return { pair: { checkIn: first!.date }, ambiguous: false };
}

// ---------------------------------------------------------------------------
// Gece sayısı ve tarih ipucu
// ---------------------------------------------------------------------------

/** "3 gece", "üç gecelik", "1 hafta", "two weeks" → gece sayısı. */
export function extractNights(text: string): number | undefined {
  const nights = text.match(new RegExp(String.raw`\b${NUM}\s*(?:gece\w*|nights?)\b`));
  const n = toNumber(nights?.[1]);
  if (n) return Math.min(n, 99);
  const weeks = text.match(new RegExp(String.raw`\b(${NUM.slice(1, -1)}|a)\s*(?:hafta(?:lik)?|weeks?)\b(?!\s*(?:sonu|sonra|once|later|ago))`));
  if (weeks) {
    const w = weeks[1] === "a" ? 1 : toNumber(weeks[1]);
    if (w) return Math.min(w * 7, 99);
  }
  return undefined;
}

/** Mesaj tarihten söz ediyor mu? (Çözülemeyen ipucu → misafire tarih sorulur.) */
function hasDateCue(input: string, raw: string): boolean {
  let text = input;
  // Gün.ay görünümlü sayı (ay 01-12): "10.08". "2.5 km", "14.00" ipucu değildir.
  for (const m of raw.matchAll(/(?<![\d./])(\d{1,2})[./](\d{2})(?![\d])/g)) {
    const month = Number(m[2]);
    if (month >= 1 && month <= 12 && Number(m[1]) >= 1 && Number(m[1]) <= 31) return true;
  }
  // Gece/hafta SÜRESİ ("1 hafta", "3 gece") ve önceki sorguya gönderme
  // ("aynı tarihlerde", "same dates") tarih ipucu değildir.
  text = text
    .replace(/\b(?:ayni|bu|o|su|bunlar|those|these|the same|same)\s+(?:tarih\w*|dates?|gun\w*|days?)\b/g, " ")
    .replace(new RegExp(String.raw`\b${NUM}\s*(?:gece\w*|nights?)\b`, "g"), " ")
    .replace(new RegExp(String.raw`\b(?:${NUM.slice(1, -1)}|a)\s*(?:hafta(?:lik)?|weeks?)\b(?!\s*(?:sonu|sonra|once|later|ago))`, "g"), " ");
  if (/\b(tarih\w*|dates?|yarin\w*|bugun\w*|tomorrow|today|tonight|hafta\w*|weeks?|weekend|bayram\w*|yilbasi\w*|noel|christmas|new year|easter|paskalya|somestr\w*|semester)\b/.test(text)) return true;
  if (WEEKDAYS.some(([, re]) => new RegExp(re.source).test(text))) return true;
  return text.split(" ").some((w) => TR_MONTHS.some((m) => w.startsWith(m)) || EN_MONTH_ONLY.has(w));
}

// ---------------------------------------------------------------------------
// Ana çıkarım
// ---------------------------------------------------------------------------

export interface StayDates {
  checkIn?: string;
  checkOut?: string;
  /** Mesajda açıkça geçen gece sayısı. */
  nights?: number;
  /** Gün belirtilmeden anılan ay (YYYY-MM). */
  month?: string;
  /** Tarihten söz ediliyor ama güvenle çözülemedi — misafire sorulmalı. */
  needsClarification: boolean;
}

export function parseStayDates(message: string, today: string): StayDates {
  const raw = message.toLocaleLowerCase("tr-TR");
  const text = normalizeText(message.replace(/[-–—]/g, " ila ").replace(/[’'`]/g, " "));
  const plain = normalizeText(message.replace(/[’'`]/g, " "));
  const nights = extractNights(plain);
  // "3-4 gece", "2 maybe 3 nights": gece sayısı belirsiz.
  const nightsAmbiguous = new RegExp(
    String.raw`\b${NUM}\s+(?:ila|veya|ya da|yada|or|to|maybe|belki)\s+${NUM}\s+(?:gece|nights?)`,
  ).test(text);

  const explicit = numericDates(raw, today) ?? textDates(text, today);
  let pair: DatePair | null = explicit;
  let ambiguous = false;
  let month: string | undefined;
  // "31 Şubat" gibi geçersiz bir gün: tahmin edilmez, sorulur.
  if (!pair && hasInvalidDayMonth(text)) {
    return { ...(nights ? { nights } : {}), needsClarification: true };
  }
  if (!pair) {
    month = monthOnly(plain, today) ?? undefined;
    if (!month) {
      const relative = relativeStay(text, today);
      pair = relative.pair;
      ambiguous = relative.ambiguous;
    }
  }

  if (!pair) {
    // Yalnız gece sayısı ("3 gece kalsak") belirsizlik değildir: önceki
    // sorgunun tarihiyle tamamlanabilir; tamamlanamazsa planlayıcı tarihi sorar.
    const needsClarification = ambiguous || nightsAmbiguous || (!month && hasDateCue(plain, raw));
    return { ...(nights ? { nights } : {}), ...(month ? { month } : {}), needsClarification };
  }

  const { checkIn } = pair;
  let checkOut = pair.checkOut;
  if (checkOut && checkOut <= checkIn) {
    // "28 aralik - 2 ocak": yılı verilmemiş çıkış ertesi yıla düşer.
    const next = pair.outYearGiven
      ? null
      : isoDate(Number(checkOut.slice(0, 4)) + 1, Number(checkOut.slice(5, 7)), Number(checkOut.slice(8, 10)));
    if (!next || next <= checkIn) return { checkIn, needsClarification: true };
    checkOut = next;
  }
  if (nightsAmbiguous && !checkOut) return { checkIn, needsClarification: true };
  if (checkOut && nights && nightsBetween(checkIn, checkOut) !== nights) {
    // "10-13 Ağustos, 5 gece": hangisi doğru bilinemez.
    return { checkIn, checkOut, nights, needsClarification: true };
  }
  if (!checkOut) checkOut = addDays(checkIn, nights ?? 1);
  return { checkIn, checkOut, ...(nights ? { nights } : {}), needsClarification: false };
}

/** Geriye uyumlu kısa biçim: yalnız giriş/çıkış. */
export function extractStayDates(message: string, today: string): { checkIn?: string; checkOut?: string } {
  const { checkIn, checkOut } = parseStayDates(message, today);
  return checkIn && checkOut ? { checkIn, checkOut } : {};
}

// ---------------------------------------------------------------------------
// Kişi sayısı ve çocuklar
// ---------------------------------------------------------------------------

export interface GuestDetails {
  /** Yetişkin (ya da yaş belirtilmemiş kişi) sayısı. */
  guestCount?: number;
  /** Çocuk sayısı (yaşı bilinsin bilinmesin). */
  childCount?: number;
  childAges?: number[];
}

function countBefore(text: string, nouns: string): number | undefined {
  // "6 yaş altı çocuk" → "altı" burada sayı değil.
  const m = text.match(new RegExp(String.raw`(?<!yas )\b${NUM}\s*(?:${nouns})\b`));
  const n = toNumber(m?.[1]);
  return n && n <= 20 ? n : undefined;
}

export function parseGuests(message: string): GuestDetails {
  const text = normalizeText(message.replace(/[’'`]/g, " "));
  const result: GuestDetails = {};

  const adults = countBefore(text, String.raw`yetiskin\w*|adults?|buyuk\w*`);
  const people = countBefore(text, String.raw`kisi\w*|people|persons?|guests?|pax`);
  let guestCount = adults ?? people;
  if (!guestCount && /\b(cift|couple|esimle|esim ve ben|with my (?:wife|husband|partner))\b/.test(text)) guestCount = 2;
  if (!guestCount && /\b(yalniz\w*|alone|solo|by myself|just me)\b/.test(text)) guestCount = 1;
  if (guestCount) result.guestCount = guestCount;

  const ages: number[] = [];
  const agePatterns = [
    // "5 ve 8 yaşında", "5 8 yasinda", "6 aylık"
    new RegExp(String.raw`\b(\d{1,2})((?:\s+(?:ve\s+|and\s+|ile\s+)?\d{1,2})*)\s*(yas(?!ak)\w*\b|years?\s+old|yrs?\b|yo\b|aylik\w*\b|months?\s+old)(?!\s+(?:alti|ustu|uzeri|ve alti|ve ustu|kadar|sinir\w*|and under|and over|or under|or older))`, "g"),
    // "aged 6 and 9", "ages 4 7"
    /\b(?:aged|ages?)\s+(\d{1,2})((?:\s+(?:and\s+)?\d{1,2})*)()/g,
  ];
  for (const re of agePatterns) {
    for (const m of text.matchAll(re)) {
      const months = /^(aylik|month)/.test(m[3] ?? "");
      const list = [m[1]!, ...(m[2] ?? "").split(/\s+(?:ve|and|ile)?\s*/)].map((s) => s.trim()).filter(Boolean);
      for (const value of list) {
        const age = months ? 0 : Number(value);
        if (Number.isInteger(age) && age >= 0 && age <= 17) ages.push(age);
      }
    }
  }
  if (ages.length) result.childAges = ages.slice(0, 10);

  const children = countBefore(text, String.raw`cocuk\w*|child|children|kids?|bebek\w*|baby|babies|infants?`);
  const childCount = Math.max(children ?? 0, ages.length);
  if (childCount) result.childCount = childCount;
  return result;
}

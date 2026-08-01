// ---------------------------------------------------------------------------
// Minimal iCalendar (RFC 5545) VEVENT ayrıştırıcı — kanal yöneticisi içe
// aktarımı için. Yalnızca meşguliyet aralığı gerekir: UID + DTSTART + DTEND.
//
// Dışa aktarma tarafındaki biçimlendirmenin tersi (bkz.
// /api/ical/export/[token]) — satır katlama (folding) ve kaçış çözülür.
// Booking.com / Airbnb / Google takvim akışları bu alt kümeyi kullanır.
// ---------------------------------------------------------------------------

export interface IcalEvent {
  uid: string;
  /** YYYY-MM-DD — konaklamanın ilk gecesi */
  start: string;
  /** YYYY-MM-DD — çıkış günü (bu gece dahil DEĞİL, DTEND exclusive) */
  end: string;
  summary?: string;
}

/**
 * Katlanmış satırları birleştirir: devam satırları boşluk veya tab ile başlar.
 * "DESCRIPTION:uzun\r\n  metin" → "DESCRIPTION:uzun metin"
 */
function unfold(raw: string): string[] {
  const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

/** "DTSTART;VALUE=DATE:20260801" → { name: "DTSTART", value: "20260801" } */
function splitProperty(line: string): { name: string; value: string } | null {
  const colon = line.indexOf(":");
  if (colon === -1) return null;
  const rawName = line.slice(0, colon);
  const semicolon = rawName.indexOf(";");
  const name = (semicolon === -1 ? rawName : rawName.slice(0, semicolon)).toUpperCase();
  return { name, value: line.slice(colon + 1) };
}

function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

/**
 * DATE (20260801) ve DATE-TIME (20260801T140000Z) biçimlerini YYYY-MM-DD'ye
 * indirger. Envanter gün bazlı olduğu için saat bilgisi atılır.
 */
export function parseIcalDate(value: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${mo}-${d}`;
}

/**
 * Akıştaki VEVENT'leri döner. Bozuk tek bir olay tüm akışı düşürmez —
 * ayrıştırılamayanlar sessizce atlanır (dış sağlayıcılar uyumsuz alan gönderir).
 */
export function parseIcal(raw: string): IcalEvent[] {
  const events: IcalEvent[] = [];
  let current: Partial<IcalEvent> | null = null;

  for (const line of unfold(raw)) {
    const prop = splitProperty(line);
    if (!prop) continue;

    if (prop.name === "BEGIN" && prop.value.trim().toUpperCase() === "VEVENT") {
      current = {};
      continue;
    }
    if (prop.name === "END" && prop.value.trim().toUpperCase() === "VEVENT") {
      if (current?.uid && current.start && current.end && current.start < current.end) {
        events.push(current as IcalEvent);
      }
      current = null;
      continue;
    }
    if (!current) continue;

    switch (prop.name) {
      case "UID":
        current.uid = prop.value.trim();
        break;
      case "DTSTART":
        current.start = parseIcalDate(prop.value) ?? undefined;
        break;
      case "DTEND":
        current.end = parseIcalDate(prop.value) ?? undefined;
        break;
      case "SUMMARY":
        current.summary = unescapeText(prop.value).trim();
        break;
    }
  }

  return events;
}

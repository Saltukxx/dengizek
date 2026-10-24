// ---------------------------------------------------------------------------
// oteldenrezerve.com içeriğini Otelsayfam alanlarına çeviren saf yardımcılar
// (bkz. scripts/import-oteldenrezerve.ts). Ayrı modül: test edilebilsin diye.
// ---------------------------------------------------------------------------

import { containsContactInfo } from "@/lib/contact-guard";

export type BoardType = "sadece-oda" | "kahvalti-dahil" | "yarim-pansiyon" | "tam-pansiyon" | "hersey-dahil";

/** Temizlik sayaçları — aktarım raporunda gösterilir. */
export const stats = { droppedContactLines: 0, droppedBrandSentences: 0, droppedKeywordLines: 0 };

/** Virgülle sıralanmış SEO anahtar kelime satırı ("x otel, x termal, x fiyat, …"). */
export function isKeywordList(line: string): boolean {
  const parts = line.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 6) return false;
  const avg = parts.reduce((n, p) => n + p.length, 0) / parts.length;
  return avg < 45 && !/[.!?]\s/.test(line);
}

/** Tamamı BÜYÜK harf yazılmış adı Türkçe kurala göre düzeltir ("AİLE ODASI" → "Aile Odası"). */
export function fixCaps(name: string): string {
  const letters = name.replace(/[^\p{L}]/gu, "");
  if (!letters || letters !== letters.toLocaleUpperCase("tr-TR")) return name.trim();
  return name
    .toLocaleLowerCase("tr-TR")
    .replace(/(^|[\s(&/-])(\p{L})/gu, (_, pre: string, ch: string) => pre + ch.toLocaleUpperCase("tr-TR"))
    .replace(/\bSpa\b/g, "Spa")
    .trim();
}

/** İletişim bilgisi ya da eski site markası geçen satır/cümleleri çıkarır. */
export function cleanText(text: string): string {
  const lines = text.split("\n").filter((line) => {
    if (isKeywordList(line)) {
      stats.droppedKeywordLines += 1;
      return false;
    }
    if (containsContactInfo(line)) {
      stats.droppedContactLines += 1;
      return false;
    }
    return true;
  });
  return lines
    .map((line) =>
      line
        .split(/(?<=[.!?])\s+/)
        .filter((sentence) => {
          if (/oteldenrezerve/i.test(sentence)) {
            stats.droppedBrandSentences += 1;
            return false;
          }
          return true;
        })
        .join(" "),
    )
    .filter((line) => line.trim())
    .join("\n")
    .trim();
}

export function boardTypeOf(label: string | undefined): BoardType | null {
  const t = (label ?? "").toLocaleLowerCase("tr-TR");
  if (!t) return null;
  if (/her ?şey dahil|all inclusive/.test(t)) return "hersey-dahil";
  if (/tam pansiyon|full board/.test(t)) return "tam-pansiyon";
  if (/yarım pansiyon|half board/.test(t)) return "yarim-pansiyon";
  if (/kahvaltı|breakfast/.test(t)) return "kahvalti-dahil";
  if (/sadece oda|room only/.test(t)) return "sadece-oda";
  return null;
}

export function sentences(text: string): string[] {
  return text.split(/\n|(?<=[.!?])\s+(?=\p{Lu})/u).map((x) => x.trim()).filter(Boolean);
}

/**
 * Saat çıkarımı: etiketlerden biri geçen ilk cümlede etiketten SONRAKİ ilk saat.
 * Etiketler öncelik sırasıyla denenir ("çıkış saati", genel "çıkış"tan önce).
 */
export function timeAfter(text: string, labels: RegExp[]): string | null {
  for (const label of labels) {
    for (const sentence of sentences(text)) {
      const m = sentence.match(new RegExp(`(?:${label.source})[^0-9]{0,40}?(\\d{1,2})[:.](\\d{2})`, "iu"));
      if (!m) continue;
      const h = Number(m[1]);
      const min = Number(m[2]);
      if (h <= 23 && min <= 59) return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    }
  }
  return null;
}

export const CHECK_IN_LABELS = [/giri[sş] saati/, /c\/in saati|check[ -]?in saati/, /giri[sş]/, /c\/in|check[ -]?in/];
export const CHECK_OUT_LABELS = [/[çc][ıi]k[ıi][sş] saati/, /c\/out saati|check[ -]?out saati/, /c\/out|check[ -]?out/];

/** Evcil hayvan kuralı — yalnız "evcil hayvan" geçen CÜMLEYE bakılır. */
export function petsAllowedOf(text: string): boolean | null {
  const sentence = sentences(text.toLocaleLowerCase("tr-TR")).find((x) => /evcil hayvan|\bpets?\b/.test(x));
  if (!sentence) return null;
  if (/kabul edil(me|mi)|kabul etm(e|i)|alınm(a|ı)|yasak|not allowed|izin veril(me|mi)|giremez/.test(sentence)) return false;
  if (/kabul edil|kabul ed|izin veril|allowed|kabul görür/.test(sentence)) return true;
  return null;
}

export function roomFacts(text: string) {
  const capacity = text.match(/(?:maksimum|max\.?|en fazla)\s*(\d{1,2})\s*yeti[sş]kin(?:\s*\+\s*(\d{1,2})\s*[çc]ocuk)?/i);
  const size = text.match(/(\d{2,3})\s*(?:m²|m2|metrekare)/i);
  return {
    capacityAdults: capacity ? Number(capacity[1]) : null,
    capacityChildren: capacity?.[2] ? Number(capacity[2]) : null,
    sizeSqm: size ? Number(size[1]) : null,
  };
}

export function shortDescriptionOf(text: string): string | null {
  // İlk satır başlıksa ("X Otel | Şifalı Tatilin Adresi") kısa açıklamaya girmez.
  const lines = text.split("\n");
  if (lines.length > 1 && lines[0]!.length < 100 && !/[.!?]$/.test(lines[0]!.trim())) lines.shift();
  const flat = lines.join(" ").trim();
  if (!flat) return null;
  const sentences = flat.split(/(?<=[.!?])\s+/);
  let out = "";
  for (const s of sentences) {
    if ((out + " " + s).trim().length > 280) break;
    out = `${out} ${s}`.trim();
  }
  return out || flat.slice(0, 277) + "…";
}

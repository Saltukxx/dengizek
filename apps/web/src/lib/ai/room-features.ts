// ---------------------------------------------------------------------------
// Oda özellikleri — balkon, klima, minibar… otelin değil odanın özelliğidir.
// Aktarılan otellerde oda özellikleri otel olanaklarıyla tek listeye karışık
// gelir; rehber "tesiste balkon var" yerine "odalarda balkon var" demeli ve
// açıklamasında "balkonsuz" yazan odaları ayrıca belirtmeli.
// ---------------------------------------------------------------------------

import { normalizeText } from "@/lib/ai/text";

/**
 * Yalnız odada olabilecek özellikler: etiket deseni + metinde aranacak kök.
 * Jakuzi, internet gibi hem otelde hem odada olabilenler bilerek yok.
 */
const ROOM_FEATURES: Array<{ label: RegExp; stem: string }> = [
  { label: /\bbalkon/, stem: "balkon" },
  { label: /\bteras\b/, stem: "teras" },
  { label: /\bklima/, stem: "klima" },
  { label: /\bminibar/, stem: "minibar" },
  { label: /\bsac kurutma/, stem: "sac kurutma" },
  { label: /\b(televizyon|tv)\b/, stem: "(?:televizyon|tv)" },
  { label: /\b(oda )?kasa(si)?\b/, stem: "kasa" },
  { label: /\bkuvet/, stem: "kuvet" },
  { label: /\bsu isiticisi/, stem: "su isitici" },
  { label: /\b(cay|kahve) ?\/? ?(kahve )?seti/, stem: "(?:cay|kahve)" },
  { label: /\bbornoz/, stem: "bornoz" },
  { label: /\boda servisi/, stem: "oda servis" },
  { label: /\bbebek yatagi/, stem: "bebek yatag" },
  { label: /\b(parke|hali zemin|seramik zemin)\b/, stem: "(?:parke|hali|seramik)" },
];

export function isRoomFeature(label: string): boolean {
  const text = normalizeText(label);
  return ROOM_FEATURES.some((f) => f.label.test(text));
}

function stemOf(label: string): string | null {
  const text = normalizeText(label);
  return ROOM_FEATURES.find((f) => f.label.test(text))?.stem ?? null;
}

/**
 * Oda metni özelliğin OLMADIĞINI söylüyor mu? "Balkonsuzdur", "balkon
 * bulunmamaktadır", "minibar yok", "without balcony".
 */
export function roomLacksFeature(roomText: string, label: string): boolean {
  const stem = stemOf(label);
  if (!stem) return false;
  const text = normalizeText(roomText);
  return new RegExp(
    `\\b${stem}\\w*(?:suz|siz|sız|süz)\\b|\\b${stem}\\w*(?:suzdur|sizdir)\\b|\\b${stem}\\w* (?:yok|bulunmamaktadir|bulunmuyor|bulunmaz|mevcut degil)\\b|\\bwithout (?:a )?${stem}`,
  ).test(text);
}

/**
 * Sorulan oda özelliğinin bulunmadığı odalar (adları). Oda kartları:
 * room.<slug>.details (açıklama) ve room.<slug>.info (ad, kapasite).
 */
export function roomsLackingFeature(
  label: string,
  catalog: Array<{ id: string; title?: string; text: string }>,
): string[] {
  const names: string[] = [];
  for (const entry of catalog) {
    if (!/^room\.[^.]+\.(details|info)$/.test(entry.id)) continue;
    const name = entry.title ?? "";
    if (!name || names.includes(name)) continue;
    if (roomLacksFeature(`${name}\n${entry.text}`, label)) names.push(name);
  }
  return names;
}

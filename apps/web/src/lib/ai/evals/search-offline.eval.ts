// ---------------------------------------------------------------------------
// Otel arama asistanı ölçümü — API ÇAĞRISI YAPMAZ (saniyeler sürer).
//
// Şehir × olanak birleşimlerinden Türkçe, İngilizce ve yazım hatalı sorgular
// üretilir. Doğru otel kümesi arama motorundan BAĞIMSIZ basit kurallarla
// (olanak adı / otel metni + şehir) hesaplanır. Ölçülen:
//   tam isabet  — bulunan küme beklenenle aynı
//   kesinlik    — bulunanların ne kadarı doğru
//   kapsama     — doğruların ne kadarı bulundu
//
//   npm run test:eval:search      (yerel DB, oteller yayında olmalı)
// Çıktı: eval-search-metrics.json
// ---------------------------------------------------------------------------

import { writeFileSync } from "node:fs";
import { afterAll, describe, it } from "vitest";
import { searchHotels, type SearchIndexHotel } from "@/lib/ai/hotel-search";
import { normalizeText } from "@/lib/ai/text";
import { getHotelSearchIndex } from "@/lib/hotel-search-index";

interface Probe {
  key: string;
  tr: string;
  en?: string;
  /** Olanak adında aranan (normalize). */
  label: RegExp;
  /** Otel metninde aranan (normalize, kelimeler yan yana). */
  text: RegExp;
}

const PROBES: Probe[] = [
  { key: "cocuk-havuzu", tr: "çocuk havuzu", en: "kids pool", label: /cocuk havuz/, text: /cocuk havuz/ },
  { key: "fitness", tr: "spor salonu", en: "gym", label: /fitness|spor salon/, text: /fitness|spor salon/ },
  { key: "hamam", tr: "hamam", en: "turkish bath", label: /hamam/, text: /hamam/ },
  { key: "jakuzi", tr: "jakuzi", en: "jacuzzi", label: /jakuzi/, text: /jakuzi/ },
  { key: "sauna", tr: "sauna", en: "sauna", label: /sauna/, text: /sauna/ },
  { key: "otopark", tr: "otopark", en: "parking", label: /otopark/, text: /otopark/ },
  { key: "aquapark", tr: "aquapark", label: /aquapark|aqua park/, text: /aquapark|aqua park/ },
];

/** Kısaltma: "Afyon" araması Afyonkarahisar'ı da kapsar. */
const CITY_GROUPS: Record<string, string[]> = { afyonkarahisar: ["afyon", "afyonkarahisar"], afyon: ["afyon", "afyonkarahisar"] };

/** Kelimenin ortasındaki iki harfin yerini değiştirir (yazım hatası). */
function typo(word: string): string {
  if (word.length < 6) return word;
  const i = Math.floor(word.length / 2);
  return word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2);
}

function truthFor(index: SearchIndexHotel[], probe: Probe, city: string): string[] {
  const names = CITY_GROUPS[city] ?? [city];
  return index
    .filter((h) => names.includes(normalizeText(h.city ?? "")) || names.some((n) => normalizeText(h.address ?? "").split(/\s+/).includes(n)))
    .filter((h) => h.amenities.some((a) => probe.label.test(normalizeText(a))) || h.texts.some((t) => probe.text.test(normalizeText(t))))
    .map((h) => h.slug)
    .sort();
}

const index = await getHotelSearchIndex();
const cities = Object.entries(
  index.reduce<Record<string, { name: string; count: number }>>((acc, h) => {
    if (!h.city) return acc;
    const key = normalizeText(h.city);
    acc[key] ??= { name: h.city, count: 0 };
    acc[key]!.count += 1;
    return acc;
  }, {}),
)
  .filter(([, v]) => v.count >= 2)
  .map(([key, v]) => ({ key, name: v.name }));

interface Case { id: string; kind: string; query: string; expected: string[] }
const cases: Case[] = [];
for (const city of cities) {
  for (const probe of PROBES) {
    const expected = truthFor(index, probe, city.key);
    cases.push({ id: `${city.key}:${probe.key}:tr`, kind: "tr", query: `${city.name}'da ${probe.tr} olan otel`, expected });
    if (probe.en) cases.push({ id: `${city.key}:${probe.key}:en`, kind: "en", query: `hotel with ${probe.en} in ${city.name}`, expected });
    const misspelled = probe.tr.split(" ").map((w) => (w.length >= 6 ? typo(w) : w)).join(" ");
    if (misspelled !== probe.tr) cases.push({ id: `${city.key}:${probe.key}:typo`, kind: "yazim-hatasi", query: `${city.name}'da ${misspelled} olan otel`, expected });
    if (city.name.length >= 6) {
      cases.push({ id: `${city.key}:${probe.key}:sehir-typo`, kind: "sehir-yazim-hatasi", query: `${typo(city.name)}'da ${probe.tr} olan otel`, expected });
    }
  }
}

const results: Array<Case & { got: string[]; ok: boolean; precision: number; recall: number; summary: string }> = [];

describe(`Arama asistanı doğruluğu (${index.length} otel, API'siz)`, () => {
  afterAll(() => {
    const byKind: Record<string, { total: number; ok: number; precision: number; recall: number }> = {};
    for (const r of results) {
      const k = (byKind[r.kind] ??= { total: 0, ok: 0, precision: 0, recall: 0 });
      k.total += 1;
      k.ok += r.ok ? 1 : 0;
      k.precision += r.precision;
      k.recall += r.recall;
    }
    const round = (n: number) => +n.toFixed(3);
    const summary = {
      generatedAt: new Date().toISOString(),
      hotels: index.length,
      queries: results.length,
      exact: round(results.filter((r) => r.ok).length / results.length),
      precision: round(results.reduce((s, r) => s + r.precision, 0) / results.length),
      recall: round(results.reduce((s, r) => s + r.recall, 0) / results.length),
      byKind: Object.fromEntries(
        Object.entries(byKind).map(([k, v]) => [k, { total: v.total, exact: round(v.ok / v.total), precision: round(v.precision / v.total), recall: round(v.recall / v.total) }]),
      ),
      failures: results
        .filter((r) => !r.ok)
        .map(({ id, query, expected, got, summary: s }) => ({
          id,
          query,
          missing: expected.filter((e) => !got.includes(e)),
          extra: got.filter((g) => !expected.includes(g)),
          summary: s,
        })),
    };
    writeFileSync("eval-search-metrics.json", JSON.stringify(summary, null, 2));
    console.log(`\nTam isabet ${(summary.exact * 100).toFixed(1)}% · kesinlik ${(summary.precision * 100).toFixed(1)}% · kapsama ${(summary.recall * 100).toFixed(1)}% (${results.length} sorgu)`);
  });

  it("tüm sorgular", () => {
    for (const c of cases) {
      const response = searchHotels(c.query, index);
      const got = response.results.map((r) => r.slug).sort();
      const hit = got.filter((g) => c.expected.includes(g)).length;
      results.push({
        ...c,
        got,
        ok: got.length === c.expected.length && hit === got.length,
        precision: got.length ? hit / got.length : c.expected.length ? 0 : 1,
        recall: c.expected.length ? hit / c.expected.length : got.length ? 0 : 1,
        summary: response.summary,
      });
    }
  });
});

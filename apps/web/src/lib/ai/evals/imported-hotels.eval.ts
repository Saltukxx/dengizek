// ---------------------------------------------------------------------------
// Aktarılan otellerle AI doğruluk ölçümü — GERÇEK Gemini çağrısı yapar.
//
// Soruların doğru cevabı otelin kendi verisinden üretilir (giriş saati,
// evcil hayvan kuralı, oda sayısı, olanaklar, mesafeler, oda kapasitesi…).
// Her turda misafirin göreceği her şey (metin + kartlar) beklenen değeri
// içeriyor mu diye bakılır; model konuştuysa hakem uydurma arar.
//
// Ön koşul (yerel DB):
//   npm run eval:imported -- publish ../../data/oteldenrezerve/termal-oteller/oteller.json
//   npm run test:eval:imported
//   npm run eval:imported -- revert ../../data/oteldenrezerve/termal-oteller/oteller.json
//
// Çıktı: eval-imported-metrics.json (kategori bazında doğruluk + hatalar).
// Testler yalnız altyapı hatasında düşer; doğruluk rapordadır.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, it, vi } from "vitest";
import { buildFactCatalog } from "@/lib/ai/fact-store";
import { normalizeText } from "@/lib/ai/text";
import { textContainsPriceLikeContent } from "@/lib/ai/response-guard";
import { chatModelId } from "@/lib/ai/llm";
import { getPublishedHotelContent } from "@/lib/hotels-repo";
import { getHotelAiProfile } from "@/lib/db/ai-context";
import { petsAllowedOf } from "@/lib/import/oteldenrezerve-text";
import { todayIso } from "@/lib/price";
import type { Fixture } from "./fixtures";
import { judgeGrounding, runTurn, type TurnResult, type Verdict } from "./harness";

// Aktarılan otellerin sanal turu yok: tek adımlı bir tur taklit edilir.
vi.mock("@/lib/mocks/hotels", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mocks/hotels")>()),
  getTourManifest: async (hotelSlug: string, tourId: string) => ({
    tourId,
    hotelSlug,
    version: 1,
    steps: [
      { stepId: "s1", order: 0, kind: "lobby", title: "Genel bakış", requiresUserContinue: false, media: { mode: "clip", src: "/demo.mp4" } },
    ],
  }),
}));

const HOTELS_FILE =
  process.env.EVAL_HOTELS_FILE ?? path.resolve(__dirname, "../../../../../../data/oteldenrezerve/termal-oteller/oteller.json");
const LIMIT = Number(process.env.EVAL_HOTEL_LIMIT) || undefined;
const slugs = (JSON.parse(readFileSync(HOTELS_FILE, "utf-8")) as Array<{ slug: string }>).map((h) => h.slug).slice(0, LIMIT);

// ---------------------------------------------------------------------------
// Görünen içerik: metin + fact kartı + fiyat kartı satırları
// ---------------------------------------------------------------------------

function visibleText(turn: TurnResult): string {
  const parts = [turn.text];
  for (const tool of turn.tools) {
    const out = tool.output as { card?: { title?: string; text?: string }; cards?: Array<{ roomName: string; lines: Array<{ label: string; value: string }> }> } | undefined;
    if (out?.card) parts.push(`${out.card.title ?? ""} ${out.card.text ?? ""}`);
    for (const card of out?.cards ?? []) parts.push(`${card.roomName} ${card.lines.map((l) => `${l.label}: ${l.value}`).join(" ")}`);
  }
  return parts.join("\n");
}

function mentions(haystack: string, needle: string): boolean {
  const hay = normalizeText(haystack).split(" ");
  const words = normalizeText(needle).split(" ").filter((w) => w.length >= 3);
  if (!words.length) return normalizeText(haystack).includes(normalizeText(needle));
  return words.every((w) => hay.some((h) => h.startsWith(w.slice(0, Math.max(4, w.length - 2)))));
}

function nextAug(day: number): string {
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  // "10-13 Ağustos": 10 Ağustos geçtiyse gelecek yıl (bkz. stay-query).
  const y = `${year}-08-10` >= today ? year : year + 1;
  return `${y}-08-${String(day).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Soru üretimi — doğru cevap otelin verisinden
// ---------------------------------------------------------------------------

type Check = (turn: TurnResult, visible: string) => string | null; // null = doğru, metin = hata nedeni

interface Case {
  id: string;
  category: string;
  hotel: string;
  message: string;
  browserLocale?: string;
  check: Check;
}

const ABSENT = [
  { message: "Otelde golf sahası var mı?", word: "golf" },
  { message: "Casino var mı?", word: "casino" },
];

async function casesFor(slug: string): Promise<Case[]> {
  const [content, profile] = await Promise.all([getPublishedHotelContent(slug), getHotelAiProfile(slug)]);
  const catalog = await buildFactCatalog(slug, { profile, content });
  const source = catalog.map((f) => f.text).join("\n");
  const { specs } = content;
  const cases: Case[] = [];
  const add = (category: string, message: string, check: Check, browserLocale?: string) =>
    cases.push({ id: `${slug}:${category}`, category, hotel: slug, message, check, browserLocale });

  // Saatler
  for (const [category, label, time, en] of [
    ["giris-saati", "Giriş saati kaçta?", specs.checkInTime, false],
    ["cikis-saati", "Odadan en geç kaçta çıkmamız gerekiyor?", specs.checkOutTime, false],
    ["giris-saati-en", "What time is check-in?", specs.checkInTime, true],
  ] as const) {
    if (time) {
      add(category, label, (_t, v) => (v.includes(time) ? null : `beklenen ${time} yok`), en ? "en-US" : undefined);
    } else {
      add(`${category}-bilinmiyor`, label, (_t, v) => {
        const stated = [...v.matchAll(/\b(\d{1,2})[:.](\d{2})\b/g)].map((m) => `${m[1]!.padStart(2, "0")}:${m[2]}`);
        const invented = stated.filter((s) => !source.includes(s) && !source.includes(s.replace(":", ".")));
        return invented.length ? `kaynakta olmayan saat: ${invented.join(", ")}` : null;
      }, en ? "en-US" : undefined);
    }
  }

  // Evcil hayvan
  add("evcil-hayvan", "Köpeğimi getirebilir miyim?", (t, v) => {
    const said = petsAllowedOf(v);
    if (specs.petsAllowed == null) return said == null || t.reply === "unknown" ? null : `kaynakta yokken "${said ? "kabul" : "kabul edilmez"}" dendi`;
    if (said == null) return `kural söylenmedi (beklenen: ${specs.petsAllowed ? "kabul" : "kabul edilmez"})`;
    return said === specs.petsAllowed ? null : `yanlış kural: ${said ? "kabul" : "kabul edilmez"}`;
  });

  // Toplam oda sayısı (yalnız metinde geçiyorsa)
  const totalRooms = source.match(/toplam\s+(\d{2,4})\s+oda/i)?.[1];
  if (totalRooms) add("oda-sayisi", "Otelde toplam kaç oda var?", (_t, v) => (v.includes(totalRooms) ? null : `beklenen ${totalRooms} yok`));

  // Var olan olanaklar: listenin başından ve sonundan (25'ten sonrası da denenir)
  const amenities = content.amenities.filter((a) => a.length > 3 && !/wi.?fi/i.test(a));
  for (const [i, amenity] of [amenities[1], amenities[amenities.length - 1]].entries()) {
    if (!amenity) continue;
    add(i === 0 ? "olanak-var" : "olanak-var-son", `${amenity} var mı?`, (t, v) =>
      t.reply === "unknown" ? "var olan olanak için 'bilgim yok' dendi" : mentions(v, amenity) ? null : `"${amenity}" cevapta yok`,
    );
  }

  // Olmayan olanaklar
  for (const absent of ABSENT) {
    if (normalizeText(source).includes(absent.word)) continue;
    add(`olanak-yok-${absent.word}`, absent.message, (t) =>
      t.reply === "unknown" || !normalizeText(t.text).includes(absent.word) ? null : `olmayan olanak (${absent.word}) var denmiş olabilir`,
    );
  }

  // Havalimanı mesafesi
  const airport = source.match(/hava(?:alan|liman)\S*\s*(?:na|ne)?\s*(\d{1,3}(?:[.,]\d)?)\s*km/i)?.[1];
  if (airport) add("havalimani", "Havalimanına uzaklığınız ne kadar?", (_t, v) => (v.includes(`${airport} km`) || v.includes(`${airport}km`) ? null : `beklenen ${airport} km yok`));

  // Fiyat
  add("fiyat-genel", "Gecelik fiyat ne kadar?", (t) => {
    if (!t.tools.some((x) => x.toolName === "getRoomPrice")) return "fiyat aracı çağrılmadı";
    return null;
  });
  add("fiyat-tarih", "10-13 Ağustos için 2 kişi fiyat ne kadar?", (t) => {
    const input = t.tools.find((x) => x.toolName === "getRoomPrice")?.input;
    if (!input) return "fiyat aracı çağrılmadı";
    const ok = input.checkIn === nextAug(10) && input.checkOut === nextAug(13) && input.guestCount === 2;
    return ok ? null : `yanlış sorgu: ${JSON.stringify(input)}`;
  });
  add("fiyat-belirsiz", "Bayramda fiyatlarınız ne kadar?", (t) => (t.reply === "askDates" ? null : "tarih sorulmadı"));

  // İletişim
  add("iletisim", "Telefon numaranız nedir?", (t, v) =>
    t.reply !== "contact" ? "iletişim cevabı verilmedi" : /\d{3}[\s-]?\d{3}[\s-]?\d{2}/.test(v) ? "numara paylaşıldı" : null,
  );

  // Oda kapasitesi
  const room = content.rooms.find((r) => r.capacityAdults);
  if (room) {
    add("oda-kapasite", `${room.name} kaç kişilik?`, (_t, v) =>
      v.includes(`${room.capacityAdults} yetişkin`) ? null : `beklenen "${room.capacityAdults} yetişkin" yok`,
    );
  }

  // Yeme-içme konsepti (metinde varsa)
  if (/kahvalt|akşam yemeğ|pansiyon|açık büfe/i.test(source)) {
    add("pansiyon", "Yemekler dahil mi, konseptiniz nedir?", (_t, v) =>
      /kahvalt|akşam yemeğ|pansiyon|açık büfe|her şey dahil/i.test(v) ? null : "konsept bilgisi verilmedi",
    );
  }

  // Serbest soru — model konuşabilir, hakem denetler
  if (/termal|havuz/i.test(source)) {
    add("serbest-termal", "Termal havuzlarınızı anlatır mısınız?", (_t, v) => (/havuz|termal/i.test(v) ? null : "havuz/termal bilgisi yok"));
  }
  return cases;
}

const cases = (await Promise.all(slugs.map(casesFor))).flat();

// ---------------------------------------------------------------------------
// Çalıştırma ve rapor
// ---------------------------------------------------------------------------

interface Result {
  id: string;
  category: string;
  hotel: string;
  message: string;
  ok: boolean;
  reason?: string;
  modelSpoke: boolean;
  verdict?: Verdict;
  text: string;
  tools: string[];
  durationMs: number;
}

const results: Result[] = [];

describe.concurrent(`Aktarılan oteller AI doğruluğu (${slugs.length} otel, ${cases.length} soru)`, () => {
  afterAll(() => {
    const byCategory: Record<string, { total: number; ok: number }> = {};
    for (const r of results) {
      byCategory[r.category] ??= { total: 0, ok: 0 };
      byCategory[r.category]!.total += 1;
      if (r.ok) byCategory[r.category]!.ok += 1;
    }
    const spoke = results.filter((r) => r.verdict && !r.verdict.skipped);
    const summary = {
      generatedAt: new Date().toISOString(),
      model: chatModelId(),
      hotels: slugs.length,
      questions: results.length,
      accuracy: results.length ? +(results.filter((r) => r.ok).length / results.length).toFixed(4) : 0,
      modelTurns: spoke.length,
      ungrounded: spoke.filter((r) => !r.verdict?.grounded).length,
      judges: Object.fromEntries(
        Object.entries(
          results.reduce<Record<string, number>>((acc, r) => {
            if (r.verdict) acc[r.verdict.skipped ? "denetlenemedi" : r.verdict.judge ?? "?"] = (acc[r.verdict.skipped ? "denetlenemedi" : r.verdict.judge ?? "?"] ?? 0) + 1;
            return acc;
          }, {}),
        ),
      ),
      byCategory: Object.fromEntries(
        Object.entries(byCategory)
          .sort()
          .map(([k, v]) => [k, { ...v, accuracy: +(v.ok / v.total).toFixed(3) }]),
      ),
      failures: results.filter((r) => !r.ok).map(({ id, message, reason, text, tools }) => ({ id, message, reason, text: text.slice(0, 300), tools })),
      results,
    };
    writeFileSync("eval-imported-metrics.json", JSON.stringify(summary, null, 2));
    console.log(`\nDoğruluk: ${(summary.accuracy * 100).toFixed(1)}% (${results.filter((r) => r.ok).length}/${results.length})`);
    for (const [k, v] of Object.entries(summary.byCategory)) console.log(`  ${k.padEnd(28)} ${String(v.ok).padStart(3)}/${String(v.total).padEnd(3)} ${(v.accuracy * 100).toFixed(0)}%`);
    console.log(`Model konuştu: ${spoke.length}, hakeme göre uydurma: ${summary.ungrounded} | hakemler: ${JSON.stringify(summary.judges)}`);
  });

  for (const c of cases) {
    it(c.id, async () => {
      const started = Date.now();
      const fixture: Fixture = { id: c.id, hotel: c.hotel, tour: "eval", message: c.message, browserLocale: c.browserLocale, expect: {} };
      const turn = await runTurn(fixture);
      const visible = visibleText(turn);
      let reason = c.check(turn, visible);
      // Sunucunun sabit metni ("10–13 Ağustos (3 gece)") gece/kişi sayısı içerebilir;
      // tutar ve yüzde her durumda yasak.
      const pricedOrServer = !turn.modelSpoke || turn.tools.some((t) => t.toolName === "getRoomPrice");
      if (!reason && textContainsPriceLikeContent(turn.text, { hadPriceTool: pricedOrServer })) reason = `metinde fiyat: ${turn.text}`;
      let verdict: Verdict | undefined;
      if (turn.modelSpoke && turn.text.trim()) {
        verdict = await judgeGrounding(turn.data, c.message, turn.text);
        if (!reason && !verdict.grounded && !verdict.skipped) reason = `uydurma: ${verdict.claim}`;
      }
      results.push({
        id: c.id,
        category: c.category,
        hotel: c.hotel,
        message: c.message,
        ok: !reason,
        reason: reason ?? undefined,
        modelSpoke: turn.modelSpoke,
        verdict,
        text: turn.text,
        tools: turn.tools.map((t) => t.toolName),
        durationMs: Date.now() - started,
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Sunucu planlayıcısı doğruluk ölçümü — API ÇAĞRISI YAPMAZ (saniyeler sürer).
//
// Aktarılan otellerin hepsinde, her otel için ~25 soru: olanaklar (eş
// anlamlı, İngilizce, çoklu eşleşme, olmayan olanak), oda listesi, saatler,
// evcil hayvan, havalimanı, fiyat, iletişim. Doğru cevap otelin verisinden,
// eşleştiriciden BAĞIMSIZ basit kurallarla hesaplanır.
//
// Embedding kapalı çalışır (en kötü durum: kota/servis hatası). Model hiç
// çağrılmaz; "model" sonucu = sunucu kart/cevap üretmedi, soru modele kalır.
//
//   npm run test:eval:planner      (yerel DB, oteller yayında olmalı)
// Çıktı: eval-planner-metrics.json
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, it, vi } from "vitest";

vi.mock("@/lib/ai/llm", async (original) => ({
  ...(await original<typeof import("@/lib/ai/llm")>()),
  getEmbeddingModel: () => null,
}));

import { buildFactCatalog } from "@/lib/ai/fact-store";
import { planServerTools, type ConversationContext, type ServerPlan } from "@/lib/ai/deterministic-tools";
import { detectToolHints } from "@/lib/ai/response-guard";
import { normalizeText } from "@/lib/ai/text";
import { getHotelAiProfile } from "@/lib/db/ai-context";
import { getPublishedHotelContent } from "@/lib/hotels-repo";
import type { AiFactCatalogEntry } from "@/lib/ai/types";

const HOTELS_FILE =
  process.env.EVAL_HOTELS_FILE ?? path.resolve(__dirname, "../../../../../../data/oteldenrezerve/termal-oteller/oteller.json");
const slugs = (JSON.parse(readFileSync(HOTELS_FILE, "utf-8")) as Array<{ slug: string }>).map((h) => h.slug);
const TODAY = "2026-10-25";

// Olanak soruları: doğru cevap = adı bu kurala uyan liste öğeleri.
const AMENITY_PROBES: Array<{ category: string; message: string; truth: RegExp; text?: RegExp }> = [
  { category: "olanak-fitness", message: "Spor salonunuz var mı?", truth: /fitness|spor salon/ },
  { category: "olanak-fitness-en", message: "Do you have a gym?", truth: /fitness|spor salon/ },
  { category: "olanak-fitness-kisa", message: "fitness var mı?", truth: /fitness|spor salon/ },
  { category: "olanak-havuz", message: "Havuz var mı?", truth: /havuz/ },
  { category: "olanak-havuz-en", message: "Is there a pool?", truth: /havuz/ },
  { category: "olanak-termal-havuz", message: "Termal havuz var mı?", truth: /termal havuz/ },
  { category: "olanak-kapali-havuz-en", message: "Do you have an indoor pool?", truth: /kapali havuz/, text: /kapali (\w+ ){0,2}havuz/ },
  { category: "olanak-cocuk-havuzu", message: "Çocuk havuzu var mı?", truth: /cocuk havuz/ },
  { category: "olanak-hamam", message: "Hamam var mı?", truth: /hamam/ },
  { category: "olanak-sauna", message: "Sauna var mı?", truth: /sauna/ },
  { category: "olanak-masaj", message: "Masaj hizmetiniz var mı?", truth: /^masaj$/, text: /\bmasaj/ },
  { category: "olanak-spa", message: "Spa var mı?", truth: /\bspa\b/ },
  { category: "olanak-otopark", message: "Otopark var mı?", truth: /otopark/ },
  { category: "olanak-otopark-en", message: "Do you have parking?", truth: /otopark/ },
  { category: "olanak-wifi", message: "Wifi var mı?", truth: /wi ?fi|internet/ },
  { category: "olanak-asansor-en", message: "Is there an elevator?", truth: /asansor/ },
  { category: "olanak-restoran", message: "Restoran var mı?", truth: /restaurant|restoran/ },
  { category: "olanak-jakuzi", message: "Jakuzi var mı?", truth: /jakuzi/ },
  { category: "olanak-klima", message: "Odalarda klima var mı?", truth: /klima/ },
  { category: "olanak-cocuk-kulubu", message: "Çocuk kulübü var mı?", truth: /club|kulub/, text: /cocuk kulub|mini ?club|kids club/ },
  { category: "olanak-kese", message: "Kese var mı?", truth: /\bkese\b/ },
  { category: "olanak-yok-golf", message: "Golf sahası var mı?", truth: /golf/ },
  { category: "olanak-yok-casino", message: "Casino var mı?", truth: /casino/ },
];

type Check = (plan: ServerPlan) => string | null;
interface Case { id: string; category: string; hotel: string; message: string; check: Check; context?: ConversationContext }

const has = (plan: ServerPlan, factId: string) => plan.calls.some((c) => c.toolName === "citeFact" && c.input.factId === factId);
const cited = (plan: ServerPlan, catalog: AiFactCatalogEntry[]) =>
  plan.calls.flatMap((c) => (c.toolName === "citeFact" ? [catalog.find((e) => e.id === c.input.factId)] : [])).filter(Boolean) as AiFactCatalogEntry[];
const describePlan = (plan: ServerPlan) =>
  plan.reply ?? (plan.amenities ? `olanak:${plan.amenities.join("|")}` : plan.calls.map((c) => ("factId" in c.input ? c.input.factId : c.toolName)).join(",") || "model");

async function casesFor(slug: string): Promise<{ cases: Case[]; catalog: AiFactCatalogEntry[]; rooms: Array<{ slug: string; name: string }> }> {
  const [content, profile] = await Promise.all([getPublishedHotelContent(slug), getHotelAiProfile(slug)]);
  const catalog = await buildFactCatalog(slug, { profile, content });
  const items = catalog.find((e) => e.id === "spec.amenities")?.items ?? [];
  const texts = catalog.map((e) => `${e.title ?? ""} ${e.text}`).join("\n");
  const cases: Case[] = [];
  const add = (category: string, message: string, check: Check, context?: ConversationContext) =>
    cases.push({ id: `${slug}:${category}`, category, hotel: slug, message, check, context });

  for (const probe of AMENITY_PROBES) {
    const truth = items.filter((label) => probe.truth.test(normalizeText(label)));
    add(probe.category, probe.message, (plan) => {
      const got = plan.amenities ?? [];
      if (!truth.length) {
        if (got.length) return `listede yokken "evet": ${got.join(", ")}`;
        // Otelin metninde geçiyorsa model cevaplayabilir; geçmiyorsa sunucu "bilgim yok" demeli.
        const term = probe.text ?? probe.truth;
        if (!term.test(normalizeText(texts))) return plan.reply === "unknown" ? null : `"bilgim yok" denmedi (${describePlan(plan)})`;
        // Listede yok ama otelin metninde geçiyor: o metni içeren kart gösterilmeli.
        return cited(plan, catalog).some((e) => term.test(normalizeText(`${e.title ?? ""} ${e.text}`)))
          ? null
          : `metinde geçiyor, kart gösterilmedi (${describePlan(plan)})`;
      }
      const wrong = got.filter((g) => !truth.includes(g));
      const missing = truth.filter((t) => !got.includes(t));
      if (!got.length) return `olanak bulunamadı (beklenen: ${truth.join(", ")}; plan: ${describePlan(plan)})`;
      if (wrong.length) return `yanlış olanak: ${wrong.join(", ")}`;
      if (missing.length) return `eksik: ${missing.join(", ")}`;
      return null;
    });
  }

  // Oda listesi
  const roomFacts = catalog.filter((e) => /^room\.[^.]+\.info$/.test(e.id));
  for (const [category, message] of [["oda-listesi", "Hangi odalarınız var?"], ["oda-listesi-en", "What rooms do you have?"]] as const) {
    add(category, message, (plan) => {
      if (!roomFacts.length) return plan.reply === "unknown" ? null : `odası yokken: ${describePlan(plan)}`;
      return plan.reply === "rooms" && plan.rooms?.length === roomFacts.length ? null : `oda listesi verilmedi: ${describePlan(plan)}`;
    });
  }
  const room = content.rooms.find((r) => r.capacityAdults);
  if (room) {
    add("oda-kapasite", `${room.name} kaç kişilik?`, (plan) =>
      has(plan, `room.${room.slug}.info`) ? null : `oda kartı yok: ${describePlan(plan)}`,
    );
  }

  // Saatler ve evcil hayvan: kart ya da (bilgi hiç yoksa) "bilgim yok"
  const timeIn = /(giri[şs]|check[\s-]?in|c\/in)[\s\S]{0,60}?\d{1,2}[:.]\d{2}/i.test(texts);
  const timeOut = /(çıkı[şs]|cikis|check[\s-]?out|c\/out|ayrılış)[\s\S]{0,60}?\d{1,2}[:.]\d{2}/i.test(texts);
  for (const [category, message, known, pattern] of [
    ["giris-saati", "Giriş saati kaçta?", timeIn, /(giri[şs]|check[\s-]?in|c\/in)[\s\S]{0,60}?\d{1,2}[:.]\d{2}/i],
    ["giris-saati-en", "What time is check-in?", timeIn, /(giri[şs]|check[\s-]?in|c\/in)[\s\S]{0,60}?\d{1,2}[:.]\d{2}/i],
    ["cikis-saati", "Odadan en geç kaçta çıkmamız gerekiyor?", timeOut, /(çıkı[şs]|cikis|check[\s-]?out|c\/out|ayrılış)[\s\S]{0,60}?\d{1,2}[:.]\d{2}/i],
  ] as const) {
    add(category, message, (plan) => {
      if (!known) return plan.reply === "unknown" ? null : `bilgi yokken: ${describePlan(plan)}`;
      return cited(plan, catalog).some((e) => pattern.test(e.text)) ? null : `saat içeren kart yok: ${describePlan(plan)}`;
    });
  }
  const petsKnown = /evcil|hayvan|\bpets?\b/i.test(texts);
  add("evcil-hayvan", "Köpeğimi getirebilir miyim?", (plan) => {
    if (!petsKnown) return plan.reply === "unknown" ? null : `bilgi yokken: ${describePlan(plan)}`;
    return cited(plan, catalog).some((e) => /evcil|hayvan/i.test(e.text)) ? null : `evcil hayvan kartı yok: ${describePlan(plan)}`;
  });

  const airport = texts.match(/hava(?:alan|liman)\p{L}*\W{0,3}(\d{1,3}(?:[.,]\d)?)\s*(?:km|kilomet)/iu)?.[1];
  if (airport) {
    add("havalimani", "Havalimanına uzaklığınız ne kadar?", (plan) =>
      cited(plan, catalog).some((e) => new RegExp(`(^|[^\\d.,])${airport.replace(".", "\\.")}\\s*(km|kilomet)`, "i").test(e.text)) ? null : `mesafe kartı yok: ${describePlan(plan)}`,
    );
  }

  // Ayrıntı soruları (saat, derece): cevap otelin metnindeyse o metin; olanak listesi asla.
  for (const [category, message, evidence] of [
    // Havuz bağlamında sıcaklık (sauna ya da kaynak çıkış sıcaklığı değil).
    ["havuz-derece", "Termal havuz kaç derece?", /havuz[^\n]{0,60}?\d{2}\s*(?:[-–]\s*\d{2}\s*)?(?:°|derece)|\d{2}\s*(?:[-–]\s*\d{2}\s*)?(?:°C?|derece)[^\n]{0,40}havuz/i],
    ["cocuk-kulubu-saat", "Çocuk kulübü kaçta açık?", /(kulüb|klüb|club)[\s\S]{0,60}?\d{1,2}[:.]\d{2}/i],
  ] as const) {
    add(category, message, (plan) => {
      const cards = cited(plan, catalog);
      if (cards.some((e) => e.id === "spec.amenities")) return "olanak listesi gösterildi";
      if (!evidence.test(texts)) return null;
      return cards.some((e) => evidence.test(`${e.title ?? ""} ${e.text}`)) ? null : `ilgili metin bulunamadı: ${describePlan(plan)}`;
    });
  }

  // Oda özellikleri: "odalarda" denir; açıklamasında olmadığı yazan odalar
  // (eşleştiriciden bağımsız basit kural) cevapta ayrıca belirtilir.
  for (const [category, message, label, lacks] of [
    ["oda-ozellik-balkon", "Balkon var mı?", /balkon/, /balkonsuz|balkon (yok|bulunmamakta)|without (a )?balcony/],
    ["oda-ozellik-minibar", "Odalarda minibar var mı?", /minibar/, /minibar (yok|bulunmamakta)/],
    ["oda-ozellik-klima", "Klima var mı?", /klima/, /klimasiz|klima (yok|bulunmamakta)/],
  ] as const) {
    const truth = items.filter((i) => label.test(normalizeText(i)));
    if (!truth.length) continue;
    const lacking = content.rooms
      .filter((r) => lacks.test(normalizeText(`${r.name}\n${r.description ?? ""}`)))
      .map((r) => r.name);
    add(category, message, (plan) => {
      if (!plan.roomFeature) return `oda özelliği olarak cevaplanmadı: ${describePlan(plan)}`;
      const got = plan.roomFeature.exceptions;
      const missing = lacking.filter((n) => !got.includes(n));
      const wrong = got.filter((n) => !lacking.includes(n));
      if (missing.length) return `bulunmayan oda belirtilmedi: ${missing.join(", ")}`;
      if (wrong.length) return `yanlış istisna: ${wrong.join(", ")}`;
      return null;
    });
  }
  // Belirli bir odanın donanımı: oda açıklama kartı gösterilmeli.
  const detailed = content.rooms.find((r) => r.description && /jakuzi|kuvet|kasa/i.test(normalizeText(r.description)));
  if (detailed) {
    add("oda-donanim", `${detailed.name} odasında neler var?`, (plan) =>
      has(plan, `room.${detailed.slug}.details`) || has(plan, `room.${detailed.slug}.info`) ? null : `oda kartı yok: ${describePlan(plan)}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Sağlamlık: yazım hatası, başka dil, iki soru, takip sorusu (1.4)
  // strict: doğru kart şart · lenient (DE/RU): doğru kart ya da modele bırakma;
  // yanlış kart ya da yanlış "bilgim yok" asla.
  // ---------------------------------------------------------------------------
  const cardCheck =
    (known: boolean, pattern: RegExp, mode: "strict" | "lenient"): Check =>
    (plan) => {
      const cards = cited(plan, catalog);
      if (!known) return plan.reply === "unknown" || (mode === "lenient" && !plan.calls.length && !plan.reply) ? null : `bilgi yokken: ${describePlan(plan)}`;
      if (cards.some((e) => pattern.test(`${e.title ?? ""} ${e.text}`))) return null;
      if (mode === "lenient" && !cards.length && !plan.reply && !plan.amenities) return null;
      return `doğru kart yok: ${describePlan(plan)}`;
    };
  const IN = /(giri[şs]|check[\s-]?in|c\/in)[\s\S]{0,60}?\d{1,2}[:.]\d{2}/i;
  const OUT = /(çıkı[şs]|cikis|check[\s-]?out|c\/out|ayrılış)[\s\S]{0,60}?\d{1,2}[:.]\d{2}/i;
  const PETS = /evcil|hayvan/i;
  for (const [category, message, known, pattern, mode] of [
    ["saglam-giris-yazim", "giris saati kacta", timeIn, IN, "strict"],
    ["saglam-giris-bitisik", "girişsaati kaçta?", timeIn, IN, "strict"],
    ["saglam-giris-en-yazim", "wat time is checkin", timeIn, IN, "strict"],
    ["saglam-cikis-en", "When do we have to check out?", timeOut, OUT, "strict"],
    ["saglam-evcil-yazim", "kopek getirebilirmiyim", petsKnown, PETS, "strict"],
    ["saglam-evcil-en", "Are pets allowed?", petsKnown, PETS, "strict"],
    ["saglam-giris-de", "Wann ist der Check-in?", timeIn, IN, "lenient"],
    ["saglam-evcil-de", "Sind Hunde erlaubt?", petsKnown, PETS, "lenient"],
    ["saglam-giris-ru", "Во сколько заезд?", timeIn, IN, "lenient"],
    ["saglam-evcil-ru", "Можно ли с собакой?", petsKnown, PETS, "lenient"],
  ] as const) {
    add(category, message, cardCheck(known, pattern, mode));
  }
  if (airport) {
    const AIR = new RegExp(`(^|[^\\d.,])${airport.replace(".", "\\.")}\\s*(km|kilomet)`, "i");
    add("saglam-havalimani-yazim", "havalimanina ne kadar uzaksiniz", cardCheck(true, AIR, "strict"));
    add("saglam-havalimani-en", "How far is the airport?", cardCheck(true, AIR, "strict"));
    add("saglam-havalimani-de", "Wie weit ist der Flughafen?", cardCheck(true, AIR, "lenient"));
  }
  // Olanak: yazım hatası ve başka dil (sauna listede varsa)
  const saunaItems = items.filter((i) => /sauna/.test(normalizeText(i)));
  if (saunaItems.length) {
    const amenityCheck = (mode: "strict" | "lenient"): Check => (plan) => {
      if (plan.amenities?.some((a) => saunaItems.includes(a))) return null;
      if (mode === "lenient" && !plan.calls.length && !plan.reply) return null;
      return `sauna bulunamadı: ${describePlan(plan)}`;
    };
    add("saglam-olanak-yazim", "saunanız varmı", amenityCheck("strict"));
    add("saglam-olanak-yazim2", "sauna varmi", amenityCheck("strict"));
    add("saglam-olanak-de", "Gibt es eine Sauna?", amenityCheck("lenient"));
    add("saglam-olanak-ru", "Есть ли сауна?", amenityCheck("lenient"));
  }
  // İki soru tek mesajda: ikisinin de cevabı (kart ya da "bilgim yok") — en azından ilki.
  if (timeIn && petsKnown) {
    add("saglam-iki-soru", "Giriş saati kaçta ve köpek kabul ediyor musunuz?", (plan) => {
      const cards = cited(plan, catalog);
      const gotIn = cards.some((e) => IN.test(e.text));
      const gotPets = cards.some((e) => PETS.test(e.text));
      if (gotIn && gotPets) return null;
      return `iki sorudan ${gotIn || gotPets ? "biri" : "hiçbiri"} cevaplandı: ${describePlan(plan)}`;
    });
  }
  // Takip sorusu: önceki soru giriş saati, şimdi "Peki çıkış?"
  if (timeOut) {
    add("saglam-takip-cikis", "Peki çıkış saati?", cardCheck(true, OUT, "strict"), { previousUserTexts: ["Giriş saati kaçta?"] });
    add("saglam-takip-cikis-kisa", "peki çıkış?", cardCheck(true, OUT, "strict"), { previousUserTexts: ["Giriş saati kaçta?"] });
  }
  // Fiyat takibi: önceki sorgu 10-13 Ağustos 2 kişi, şimdi kişi sayısı değişiyor.
  add(
    "saglam-takip-fiyat",
    "Peki 3 kişi olursak?",
    (plan) => {
      const input = plan.calls.find((c) => c.toolName === "getRoomPrice")?.input as { checkIn?: string; guestCount?: number } | undefined;
      return input?.checkIn === "2027-08-10" && input.guestCount === 3 ? null : `takip fiyatı yanlış: ${JSON.stringify(input ?? describePlan(plan))}`;
    },
    { previousUserTexts: ["10-13 Ağustos için 2 kişi fiyat ne kadar?"], lastPriceQuery: { checkIn: "2027-08-10", checkOut: "2027-08-13", guestCount: 2 } },
  );

  // Fiyat ve iletişim
  add("fiyat-tarih", "10-13 Ağustos için 2 kişi fiyat ne kadar?", (plan) => {
    const call = plan.calls.find((c) => c.toolName === "getRoomPrice");
    if (!call) return `fiyat aracı yok: ${describePlan(plan)}`;
    const input = call.input as { checkIn?: string; checkOut?: string; guestCount?: number };
    return input.checkIn === "2027-08-10" && input.checkOut === "2027-08-13" && input.guestCount === 2 ? null : `yanlış sorgu: ${JSON.stringify(input)}`;
  });
  add("fiyat-belirsiz", "Bayramda fiyatlarınız ne kadar?", (plan) => (plan.reply === "askDates" ? null : `tarih sorulmadı: ${describePlan(plan)}`));
  add("iletisim", "Telefon numaranız nedir?", (plan) => (plan.reply === "contact" ? null : `iletişim cevabı yok: ${describePlan(plan)}`));

  return { cases, catalog, rooms: content.rooms.map((r) => ({ slug: r.slug, name: r.name })) };
}

const hotels = await Promise.all(slugs.map(async (slug) => ({ slug, ...(await casesFor(slug)) })));
const results: Array<{ id: string; category: string; message: string; ok: boolean; reason?: string }> = [];

describe(`Planlayıcı doğruluğu (${hotels.length} otel, API'siz)`, () => {
  afterAll(() => {
    const byCategory: Record<string, { total: number; ok: number }> = {};
    for (const r of results) {
      byCategory[r.category] ??= { total: 0, ok: 0 };
      byCategory[r.category]!.total += 1;
      if (r.ok) byCategory[r.category]!.ok += 1;
    }
    const ok = results.filter((r) => r.ok).length;
    const summary = {
      generatedAt: new Date().toISOString(),
      hotels: hotels.length,
      questions: results.length,
      accuracy: +(ok / results.length).toFixed(4),
      byCategory: Object.fromEntries(Object.entries(byCategory).sort().map(([k, v]) => [k, { ...v, accuracy: +(v.ok / v.total).toFixed(3) }])),
      failures: results.filter((r) => !r.ok),
    };
    writeFileSync("eval-planner-metrics.json", JSON.stringify(summary, null, 2));
    console.log(`\nDoğruluk: ${(summary.accuracy * 100).toFixed(1)}% (${ok}/${results.length})`);
    for (const [k, v] of Object.entries(summary.byCategory)) console.log(`  ${k.padEnd(26)} ${String(v.ok).padStart(3)}/${String(v.total).padEnd(3)} ${(v.accuracy * 100).toFixed(0)}%`);
  });

  it("tüm sorular", async () => {
    for (const hotel of hotels) {
      for (const c of hotel.cases) {
        const plan = await planServerTools({
          message: c.message,
          messageEmbedding: null,
          hints: detectToolHints(c.message),
          inquiryIntent: "none",
          catalog: hotel.catalog,
          rooms: hotel.rooms,
          today: TODAY,
          context: c.context,
        });
        const reason = c.check(plan);
        results.push({ id: c.id, category: c.category, message: c.message, ok: !reason, reason: reason ?? undefined });
      }
    }
  });
});

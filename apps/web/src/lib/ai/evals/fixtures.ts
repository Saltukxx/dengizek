// ---------------------------------------------------------------------------
// AI rehber eval soru seti — 6 otel (seed verisi), TR + EN, yazım hataları,
// göreli tarihler, çok adımlı sohbet, bir mesajda iki soru, katalog dışı ve
// iletişim soruları. Beklentiler seed'e göre yazıldı (bkz. src/lib/db/seed.ts).
// ---------------------------------------------------------------------------

import { todayIso } from "@/lib/price";

export type ToolName =
  | "navigateTo"
  | "suggestNext"
  | "openInquiry"
  | "autoTourNext"
  | "endAutoTour"
  | "getRoomPrice"
  | "citeFact";

export interface HistoryMessage {
  role: "user" | "assistant";
  parts: Array<Record<string, unknown>>;
}

export interface Expectations {
  /** Hepsi bu turda (sunucu ya da model tarafından) çağrılmış olmalı. */
  tools?: ToolName[];
  /** Hiçbiri çağrılmamış olmalı. */
  notTools?: ToolName[];
  /** citeFact'in factId'si bunlardan biri olmalı. */
  factIds?: string[];
  /** getRoomPrice girdisi bu alanları (aynı değerlerle) içermeli. */
  price?: Record<string, unknown>;
  /** getRoomPrice girdisinde bu alanlar OLMAMALI. */
  priceAbsent?: string[];
  /** navigateTo'nun stepId'si bunlardan biri olmalı. */
  steps?: string[];
  /** Sunucunun sabit cevabı: "bilgim yok" ya da "iletişim bilgisi paylaşamam". */
  reply?: "unknown" | "contact";
  /** Ya "bilgim yok" cevabı ya da bu fact'lerden birinin kartı (ikisi de doğru). */
  unknownOrFacts?: string[];
  /** openInquiry çağrıldıysa sonucu engellenmiş olmalı/olmamalı. */
  inquiryBlocked?: boolean;
}

export interface Fixture {
  id: string;
  hotel: string;
  tour: string;
  /** Kullanıcı mesajı; tetikleyici turlarda boş bırakılır. */
  message: string;
  /** Kullanıcı mesajı yerine tur tetikleyicisi (model anlatır, hakem denetler). */
  trigger?: "tourStart" | "stepStart" | "stepEnd" | "idle";
  history?: HistoryMessage[];
  currentStepId?: string;
  stepsSeen?: string[];
  browserLocale?: string;
  expect: Expectations;
}

// ---------------------------------------------------------------------------
// Tarih yardımcıları — beklentiler eval'ın çalıştığı güne göre hesaplanır.
// ---------------------------------------------------------------------------

const TODAY = todayIso();

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dow(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/** Yılsız "gün ay": bu yıl, geçmişse gelecek yıl. */
function nextOccurrence(month: number, day: number): string {
  const year = Number(TODAY.slice(0, 4));
  const pad = (n: number) => String(n).padStart(2, "0");
  const thisYear = `${year}-${pad(month)}-${pad(day)}`;
  return thisYear >= TODAY ? thisYear : `${year + 1}-${pad(month)}-${pad(day)}`;
}

function shiftYear(iso: string, from: string): string {
  return `${from.slice(0, 4)}${iso.slice(4)}`;
}

const TOMORROW = addDays(TODAY, 1);
/** "Bu hafta sonu": cuma–pazar (cumartesi ise dünkü cuma baz alınır, giriş bugün). */
const THIS_WEEKEND = (() => {
  const d = dow(TODAY);
  const friday = d === 5 ? TODAY : d === 6 ? addDays(TODAY, -1) : addDays(TODAY, ((5 - d + 7) % 7) || 7);
  return { checkIn: friday < TODAY ? TODAY : friday, checkOut: addDays(friday, 2) };
})();
const AUG_10 = nextOccurrence(8, 10);
const AUG_13 = shiftYear("2000-08-13", AUG_10);
const JUL_15 = nextOccurrence(7, 15);
const JUL_18 = shiftYear("2000-07-18", JUL_15);

// ---------------------------------------------------------------------------
// Ortak beklentiler
// ---------------------------------------------------------------------------

const CHECK_IN = ["spec.check_in", "policy.manual.0"];
const CHECK_OUT = ["spec.check_out", "policy.manual.1"];
const CANCELLATION = ["policy.cancellation", "policy.manual.2"];
const PETS = ["policy.pets", "policy.manual.3"];

const priceTurn = (input: Record<string, unknown>): HistoryMessage => ({
  role: "assistant",
  parts: [
    { type: "step-start" },
    { type: "tool-getRoomPrice", toolCallId: "srv_hist", state: "output-available", input, output: { ok: true, cards: [] } },
    { type: "text", text: "Güncel fiyatları kartta görebilirsiniz." },
  ],
});
const user = (text: string): HistoryMessage => ({ role: "user", parts: [{ type: "text", text }] });
const assistant = (text: string): HistoryMessage => ({ role: "assistant", parts: [{ type: "text", text }] });

// ---------------------------------------------------------------------------
// Aurelia Bay (yaz, detaylı katalog)
// ---------------------------------------------------------------------------

const A = { hotel: "aurelia-bay", tour: "demo-lobby" };

const aurelia: Fixture[] = [
  // Fiyat
  { ...A, id: "a-fiyat-genel", message: "Fiyatlarınız ne kadar?", expect: { tools: ["getRoomPrice"], priceAbsent: ["roomSlug"] } },
  { ...A, id: "a-fiyat-deluxe", message: "Deniz manzaralı deluxe odanın gecelik fiyatı ne kadar?", expect: { tools: ["getRoomPrice"], price: { roomSlug: "seaview-deluxe" } } },
  { ...A, id: "a-fiyat-aralik", message: "10-13 Ağustos için avlu sessiz odanın toplam fiyatı nedir?", expect: { tools: ["getRoomPrice"], price: { roomSlug: "courtyard-quiet", checkIn: AUG_10, checkOut: AUG_13 } } },
  { ...A, id: "a-fiyat-kisi", message: "2 yetişkin 1 çocuk için gecelik fiyat ne kadar?", expect: { tools: ["getRoomPrice"], price: { guestCount: 2 } } },
  { ...A, id: "a-fiyat-cocuk-yas", message: "2 yetişkin ve 5 yaşında bir çocuk için deluxe kaç para?", expect: { tools: ["getRoomPrice"], price: { roomSlug: "seaview-deluxe", guestCount: 2, childAges: [5] } } },
  { ...A, id: "a-fiyat-yarin", message: "Yarın için bir gece kalmak kaç para tutar?", expect: { tools: ["getRoomPrice"], price: { checkIn: TOMORROW, checkOut: addDays(TOMORROW, 1) } } },
  { ...A, id: "a-fiyat-hafta-sonu", message: "Bu hafta sonu için fiyat alabilir miyim?", expect: { tools: ["getRoomPrice"], price: THIS_WEEKEND } },
  { ...A, id: "a-fiyat-yazim", message: "fiyatlar ne kadr acaba", expect: { tools: ["getRoomPrice"] } },
  { ...A, id: "a-fiyat-en", message: "How much is the sea view deluxe room per night?", browserLocale: "en-US", expect: { tools: ["getRoomPrice"], price: { roomSlug: "seaview-deluxe" } } },
  { ...A, id: "a-fiyat-en-tarih", message: "What's the price for August 10-13 for 2 adults?", browserLocale: "en-US", expect: { tools: ["getRoomPrice"], price: { checkIn: AUG_10, checkOut: AUG_13, guestCount: 2 } } },

  // Bilgi
  { ...A, id: "a-checkin", message: "Check-in saati kaçta?", expect: { tools: ["citeFact"], factIds: CHECK_IN } },
  { ...A, id: "a-checkin-yazim", message: "chekin saat kacta", expect: { tools: ["citeFact"], factIds: CHECK_IN } },
  { ...A, id: "a-checkout", message: "Odadan en geç kaçta çıkmamız gerekiyor?", expect: { tools: ["citeFact"], factIds: CHECK_OUT } },
  { ...A, id: "a-iptal", message: "İptal politikanız nedir?", expect: { tools: ["citeFact"], factIds: CANCELLATION } },
  { ...A, id: "a-iptal-dolayli", message: "Rezervasyonu son anda iptal edersem ücret öder miyim?", expect: { tools: ["citeFact"], factIds: CANCELLATION } },
  { ...A, id: "a-evcil", message: "Köpeğimi getirebilir miyim?", expect: { tools: ["citeFact"], factIds: PETS } },
  { ...A, id: "a-cocuk", message: "Çocuklar için politikanız nedir?", expect: { tools: ["citeFact"], factIds: ["policy.children", "policy.manual.4"] } },
  { ...A, id: "a-yildiz", message: "Otel kaç yıldızlı?", expect: { tools: ["citeFact"], factIds: ["spec.star_rating", "statement.0"] } },
  { ...A, id: "a-adres", message: "Otelin adresi nedir?", expect: { tools: ["citeFact"], factIds: ["spec.address", "statement.3"] } },
  { ...A, id: "a-restoran", message: "Restoranınız hakkında bilgi verir misiniz?", expect: { tools: ["citeFact"], factIds: ["restaurant.aurelia-teras", "statement.5"] } },
  { ...A, id: "a-transfer", message: "Havalimanı transferi hizmetiniz var mı?", expect: { tools: ["citeFact"], factIds: ["extra.havalimani-transferi"] } },
  { ...A, id: "a-spa", message: "Spa hizmetiniz var mı?", expect: { tools: ["citeFact"], factIds: ["extra.spa-paketi", "spec.amenities", "statement.5"] } },
  { ...A, id: "a-olanaklar", message: "Otelde hangi olanaklar sunuluyor?", expect: { tools: ["citeFact"], factIds: ["spec.amenities"] } },
  { ...A, id: "a-wifi", message: "Wifi ücretsiz mi?", expect: { tools: ["citeFact"], factIds: ["policy.manual.5", "spec.amenities"] } },
  { ...A, id: "a-oda-bilgi", message: "Deniz manzaralı deluxe oda hakkında bilgi verir misiniz?", expect: { tools: ["citeFact"], factIds: ["room.seaview-deluxe.info"] } },
  { ...A, id: "a-kurulus", message: "Otel ne zaman kuruldu?", expect: { tools: ["citeFact"], factIds: ["statement.2"] } },
  { ...A, id: "a-en-checkin", message: "What time is check-in at the hotel?", browserLocale: "en-US", expect: { tools: ["citeFact"], factIds: CHECK_IN } },
  { ...A, id: "a-en-pets", message: "Are pets allowed?", browserLocale: "en-US", expect: { tools: ["citeFact"], factIds: PETS } },

  // İki soru bir arada
  { ...A, id: "a-fiyat-ve-iptal", message: "Gecelik fiyat ne kadar, iptal politikası nedir?", expect: { tools: ["getRoomPrice", "citeFact"], factIds: CANCELLATION } },

  // Gezinme
  { ...A, id: "a-nav-sahil", message: "Sahili görmek istiyorum", expect: { tools: ["navigateTo"], steps: ["s2"] } },
  { ...A, id: "a-nav-odalar", message: "Odaları görebilir miyim?", expect: { tools: ["navigateTo"], steps: ["s3"] } },
  { ...A, id: "a-nav-plaj", message: "Plajı göster", expect: { tools: ["navigateTo"], steps: ["s2"] } },
  { ...A, id: "a-nav-lobi", message: "Lobiye geri dönelim mi, görmek istiyorum", currentStepId: "s2", stepsSeen: ["s1", "s2"], expect: { tools: ["navigateTo"], steps: ["s1"] } },
  { ...A, id: "a-nav-en", message: "I would like to see the beach please", browserLocale: "en-US", expect: { tools: ["navigateTo"], steps: ["s2"] } },

  // İletişim — rehber bilgi vermez
  { ...A, id: "a-telefon", message: "İletişim telefon numaranız nedir?", expect: { notTools: ["citeFact"], reply: "contact" } },
  { ...A, id: "a-whatsapp", message: "Whatsapp hattınız var mı?", expect: { notTools: ["citeFact"], reply: "contact" } },
  { ...A, id: "a-email", message: "What is your email address?", browserLocale: "en-US", expect: { notTools: ["citeFact"], reply: "contact" } },

  // Katalog dışı — uydurma yok
  { ...A, id: "a-kayak", message: "Otelde kayak pisti var mı?", expect: { reply: "unknown" } },
  { ...A, id: "a-golf", message: "Golf sahanız var mı?", expect: { reply: "unknown" } },
  { ...A, id: "a-casino", message: "Is there a casino?", browserLocale: "en-US", expect: { reply: "unknown" } },

  // Rezervasyon talebi
  { ...A, id: "a-talep-acik", message: "Hemen rezervasyon yapmak istiyorum, talep oluşturur musunuz?", expect: { tools: ["openInquiry"], inquiryBlocked: false } },
  { ...A, id: "a-talep-en", message: "I would like to book this room.", browserLocale: "en-US", expect: { tools: ["openInquiry"], inquiryBlocked: false } },
  { ...A, id: "a-talep-belirsiz", message: "Teşekkürler, çok güzel görünüyor.", expect: { notTools: ["getRoomPrice", "citeFact"], inquiryBlocked: true } },
  { ...A, id: "a-selam", message: "Merhaba!", expect: { notTools: ["getRoomPrice", "citeFact", "openInquiry"] } },

  // Çok adımlı sohbet
  {
    ...A,
    id: "a-takip-kisi",
    history: [user("Deniz manzaralı deluxe 10-13 Ağustos ne kadar?"), priceTurn({ roomSlug: "seaview-deluxe", checkIn: AUG_10, checkOut: AUG_13 })],
    message: "Peki 3 kişi olursak?",
    expect: { tools: ["getRoomPrice"], price: { roomSlug: "seaview-deluxe", checkIn: AUG_10, checkOut: AUG_13, guestCount: 3 } },
  },
  {
    ...A,
    id: "a-takip-tarih",
    history: [user("Deniz manzaralı deluxe 10-13 Ağustos ne kadar?"), priceTurn({ roomSlug: "seaview-deluxe", checkIn: AUG_10, checkOut: AUG_13 })],
    message: "Peki 15-18 Temmuz için?",
    expect: { tools: ["getRoomPrice"], price: { roomSlug: "seaview-deluxe", checkIn: JUL_15, checkOut: JUL_18 } },
  },
  {
    ...A,
    id: "a-takip-oda-degisim",
    history: [user("Deniz manzaralı deluxe 10-13 Ağustos ne kadar?"), priceTurn({ roomSlug: "seaview-deluxe", checkIn: AUG_10, checkOut: AUG_13 })],
    message: "Avlu sessiz oda için aynı tarihlerde fiyat ne olur?",
    expect: { tools: ["getRoomPrice"], price: { roomSlug: "courtyard-quiet", checkIn: AUG_10, checkOut: AUG_13 } },
  },
  {
    ...A,
    id: "a-takip-oncekioda",
    history: [user("Avlu sessiz oda hakkında bilgi verir misiniz?"), assistant("Bilgiyi sizin için kartta paylaştım.")],
    message: "Fiyatı ne kadar?",
    expect: { tools: ["getRoomPrice"], price: { roomSlug: "courtyard-quiet" } },
  },
  {
    ...A,
    id: "a-takip-en",
    browserLocale: "en-US",
    history: [user("How much is the sea view deluxe room?"), priceTurn({ roomSlug: "seaview-deluxe" })],
    message: "And for 4 nights from tomorrow?",
    expect: { tools: ["getRoomPrice"], price: { roomSlug: "seaview-deluxe", checkIn: TOMORROW, checkOut: addDays(TOMORROW, 4) } },
  },
  {
    ...A,
    id: "a-takip-konu-degisti",
    history: [user("Fiyatlarınız ne kadar?"), priceTurn({})],
    message: "Peki check-in saati kaçta?",
    expect: { tools: ["citeFact"], notTools: ["getRoomPrice"], factIds: CHECK_IN },
  },
];

// ---------------------------------------------------------------------------
// Kış otelleri — her biri için çekirdek senaryolar
// ---------------------------------------------------------------------------

interface WinterHotel {
  hotel: string;
  room: { slug: string; phrase: string };
  step2: { title: string; ask: string };
  hasPool: boolean;
  checkOut: string;
}

const winterHotels: WinterHotel[] = [
  { hotel: "kar-zirvesi", room: { slug: "somineli-suit", phrase: "Şömineli suit" }, step2: { title: "kayak odası", ask: "Kayak odasını görebilir miyim?" }, hasPool: true, checkOut: "11:00" },
  { hotel: "palandoken-zirve", room: { slug: "zirve-suit", phrase: "Zirve suit" }, step2: { title: "telesiyej", ask: "Telesiyej çıkışını göster" }, hasPool: true, checkOut: "11:00" },
  { hotel: "kartalkaya-cam-konagi", room: { slug: "aile-odasi", phrase: "Aile odası" }, step2: { title: "kayak okulu", ask: "Çocuk kayak okulunu görmek istiyorum" }, hasPool: false, checkOut: "11:00" },
  { hotel: "erciyes-kar-evi", room: { slug: "teras-odasi", phrase: "Teras odası" }, step2: { title: "gondol", ask: "Teras ve gondol yolunu görelim" }, hasPool: false, checkOut: "11:00" },
  { hotel: "sarikamis-kristal", room: { slug: "orman-manzarali", phrase: "Orman manzaralı oda" }, step2: { title: "pist", ask: "Orman pistini görebilir miyim?" }, hasPool: false, checkOut: "11:00" },
];

const winter: Fixture[] = winterHotels.flatMap((w): Fixture[] => {
  const base = { hotel: w.hotel, tour: "kis-turu" };
  const p = w.hotel.split("-")[0];
  return [
    { ...base, id: `${p}-fiyat-oda`, message: `${w.room.phrase} gecelik ne kadar?`, expect: { tools: ["getRoomPrice"], price: { roomSlug: w.room.slug } } },
    { ...base, id: `${p}-fiyat-hafta-sonu`, message: "Bu hafta sonu 2 kişi kaç para?", expect: { tools: ["getRoomPrice"], price: { ...THIS_WEEKEND, guestCount: 2 } } },
    { ...base, id: `${p}-checkout`, message: "Check-out saati kaçta?", expect: { tools: ["citeFact"], factIds: CHECK_OUT } },
    { ...base, id: `${p}-iptal`, message: "İptal koşulları neler?", expect: { tools: ["citeFact"], factIds: CANCELLATION } },
    { ...base, id: `${p}-cocuk`, message: "Çocuklar ücretsiz mi?", expect: { tools: ["citeFact"], factIds: ["policy.children"] } },
    { ...base, id: `${p}-oda-bilgi`, message: `${w.room.phrase} kaç metrekare?`, expect: { tools: ["citeFact"], factIds: [`room.${w.room.slug}.info`] } },
    { ...base, id: `${p}-adres`, message: "Otel nerede, adresiniz ne?", expect: { tools: ["citeFact"], factIds: ["spec.address"] } },
    { ...base, id: `${p}-nav`, message: w.step2.ask, expect: { tools: ["navigateTo"], steps: ["s2"] } },
    w.hasPool
      ? { ...base, id: `${p}-havuz-var`, message: "Havuzunuz var mı?", expect: { tools: ["citeFact"], factIds: ["spec.amenities", "statement.3"] } }
      : { ...base, id: `${p}-havuz-yok`, message: "Havuzunuz var mı?", expect: { unknownOrFacts: ["spec.amenities"] } },
    { ...base, id: `${p}-talep`, message: "Rezervasyon yapmak istiyorum", expect: { tools: ["openInquiry"], inquiryBlocked: false } },
  ];
});

// ---------------------------------------------------------------------------
// Tur anlatımı — model konuşur, hakem otel verisi dışı iddia arar.
// ---------------------------------------------------------------------------

const narration: Fixture[] = [
  { ...A, id: "a-anlatim-baslangic", trigger: "tourStart", message: "", expect: { notTools: ["getRoomPrice"] } },
  { ...A, id: "a-anlatim-sahil", trigger: "stepStart", currentStepId: "s2", stepsSeen: ["s1", "s2"], message: "", expect: { notTools: ["getRoomPrice"] } },
  { ...A, id: "a-anlatim-suit", trigger: "stepStart", currentStepId: "s3", stepsSeen: ["s1", "s3"], message: "", expect: { notTools: ["getRoomPrice"] } },
  { ...A, id: "a-anlatim-bekleme", trigger: "idle", currentStepId: "s2", stepsSeen: ["s1", "s2"], message: "", expect: { notTools: ["getRoomPrice"] } },
  ...winterHotels.map((w): Fixture => ({
    hotel: w.hotel,
    tour: "kis-turu",
    id: `${w.hotel.split("-")[0]}-anlatim-s2`,
    trigger: "stepStart",
    currentStepId: "s2",
    stepsSeen: ["s1", "s2"],
    message: "",
    expect: { notTools: ["getRoomPrice"] },
  })),
  // Serbest sohbet
  { ...A, id: "a-sohbet-lobi", message: "Bu lobi çok güzel, burada neler yapılabilir?", expect: { notTools: ["getRoomPrice"] } },
  { ...A, id: "a-sohbet-oneri", message: "Bana bu otelde ne yapmamı önerirsin?", expect: { notTools: ["getRoomPrice"] } },
  { hotel: "kar-zirvesi", tour: "kis-turu", id: "kar-sohbet-kayak", message: "Kayak yapmayı hiç bilmiyorum, burası bana uygun mu?", expect: { notTools: ["getRoomPrice"] } },
];

export const fixtures: Fixture[] = [...aurelia, ...winter, ...narration];

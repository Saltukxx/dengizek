// ---------------------------------------------------------------------------
// Vitrin tanıtımı ("Otelsayfam neden farklı?") — yüzey başına ayar.
//
// Yaz, kış ve termal ana sayfaları aynı bölümleri kullanır; değişen yalnız
// metinler, duraklar (videolar) ve sahne soruları. Banner'da soru ile arkadaki
// görüntü eşleşmeli: ilk durağın videosu demo sorusunun konusudur, takip
// sorusu ikinci durağı, "Oteli gezdir" üçüncü durağı gösterir.
//
// İstemci ve sunucu tarafından paylaşılır; sunucu importu yoktur.
// ---------------------------------------------------------------------------

import type { GuestSurface } from "@/lib/guest-surface";

export interface ShowcaseStop {
  id: string;
  label: string;
  /** public/ altındaki yol, uzantısız (.mp4 + .jpg kapak). */
  media: string;
  /** Dar sahnede klibin gösterilen kısmı (object-position). */
  focus?: string;
}

export interface ShowcaseScript {
  stops: readonly [ShowcaseStop, ShowcaseStop, ShowcaseStop];
  /** Misafirin ikinci sorusu — ikinci durağa götürür ("Spayı göster"). */
  followUp: string;
  followUpReply: string;
  /** "Oteli gezdir" sonrası rehber cümlesi (üçüncü durak). */
  autoTourReply: string;
}

export interface ShowcaseDemoQuestion {
  question: string;
  /** Cevap cümlesi bu kalıpların hepsine uymalı (değer + konu). */
  accept: readonly RegExp[];
}

export interface ShowcaseConfig {
  surface: GuestSurface;
  headline: readonly string[];
  lede: string;
  script: ShowcaseScript;
  /** Sırayla denenir; ilk durağın konusuyla eşleşmeli. */
  demoQuestions: readonly ShowcaseDemoQuestion[];
  stats: { hotels: string; provinces: string };
  aiExamples: {
    search: string;
    searchChips: readonly [string, string, string];
    voice: string;
  };
}

const TIME = /\d{1,2}[:.]\d{2}/;
const DEGREES = /\d{2}\s*(?:[-–]\s*\d{2}\s*)?(?:°|derece)/i;

export const SHOWCASE_CONFIGS: Record<GuestSurface, ShowcaseConfig> = {
  yaz: {
    surface: "yaz",
    headline: ["Otele", "gitmeden", "önce", "içini", "gezin."],
    lede:
      "Otelsayfam’da oteller fotoğraf galerisiyle değil, duraklı video turla tanıtılır. Tur sırasında yapay zekâ rehberine sorun; cevabı otelin kendi bilgisinden, kaynağıyla birlikte alın.",
    script: {
      stops: [
        { id: "restoran", label: "Restoran", media: "/marketing/yaz/restoran", focus: "45% 50%" },
        { id: "plaj", label: "Plaj", media: "/marketing/yaz/plaj", focus: "30% 50%" },
        { id: "havuz", label: "Havuz", media: "/marketing/yaz/havuz", focus: "40% 50%" },
      ],
      followUp: "Plajı göster",
      followUpReply: "Plaja geçiyorum.",
      autoTourReply: "Sıradaki durak: havuz.",
    },
    demoQuestions: [
      { question: "Restoran kaçta açık?", accept: [TIME, /restoran/i] },
      { question: "Kahvaltı saat kaçta?", accept: [TIME, /kahvalt/i] },
    ],
    stats: { hotels: "otel yayında", provinces: "şehirde" },
    aiExamples: {
      search: "Özel plajı ve çocuk havuzu olan otel",
      searchChips: ["Özel plaj", "Çocuk havuzu", "Yaz"],
      voice: "“Plaja yürüyerek kaç dakika?”",
    },
  },
  kis: {
    surface: "kis",
    headline: ["Kışı,", "gitmeden", "önce", "yaşayın."],
    lede:
      "Kayak otellerini fotoğraftan değil, odasından pistine duraklı video turla tanıyın. Tur sırasında yapay zekâ rehberine sorun; cevabı otelin kendi bilgisinden, kaynağıyla birlikte alın.",
    script: {
      stops: [
        { id: "gondol", label: "Gondol", media: "/marketing/kis/gondol", focus: "50% 50%" },
        { id: "somine", label: "Şömineli oda", media: "/marketing/kis/somine", focus: "30% 50%" },
        { id: "pist", label: "Pist", media: "/marketing/kis/pist", focus: "30% 50%" },
      ],
      followUp: "Şömineli odayı göster",
      followUpReply: "Şömineli odaya geçiyorum.",
      autoTourReply: "Sıradaki durak: pist.",
    },
    demoQuestions: [
      { question: "Gondol istasyonu ne kadar uzak?", accept: [/gondol|telesiyej|teleferik/i] },
      { question: "Gece kayağı var mı?", accept: [/kaya[ğg]|pist/i] },
    ],
    stats: { hotels: "kış oteli yayında", provinces: "kayak bölgesinde" },
    aiExamples: {
      search: "Uludağ’da spa’sı olan kayak oteli",
      searchChips: ["Uludağ", "Spa", "Kış"],
      voice: "“Kayak dolabı odaya yakın mı?”",
    },
  },
  termal: {
    surface: "termal",
    headline: ["Termal", "oteli", "gitmeden", "gezin,", "merak", "ettiğinizi", "sorun."],
    lede:
      "Otelsayfam’da termal oteller fotoğraf galerisiyle değil, duraklı video turla tanıtılır. Tur sırasında yapay zekâ rehberine sorun; cevabı otelin kendi bilgisinden, kaynağıyla birlikte alın.",
    script: {
      stops: [
        { id: "termal-havuz", label: "Termal havuz", media: "/marketing/termal/termal-havuz", focus: "50% 50%" },
        // Yağı döken eller sol üstte; sağ alt köşe sohbet panelinin altında kalır.
        { id: "spa", label: "Spa", media: "/marketing/termal/spa", focus: "20% 50%" },
        { id: "acik-havuz", label: "Açık havuz", media: "/marketing/termal/acik-havuz", focus: "40% 50%" },
      ],
      followUp: "Spayı göster",
      followUpReply: "Spa merkezine geçiyorum.",
      autoTourReply: "Sıradaki durak: açık havuz.",
    },
    demoQuestions: [
      { question: "Termal havuz kaç derece?", accept: [DEGREES, /havuz/i] },
      { question: "Termal havuz kaçta açık?", accept: [TIME, /havuz/i] },
      { question: "Kapalı havuz kaçta açık?", accept: [TIME, /havuz/i] },
    ],
    stats: { hotels: "termal otel yayında", provinces: "ilde kaplıca bölgesi" },
    aiExamples: {
      search: "Afyon’da çocuk havuzu olan termal otel",
      searchChips: ["Afyonkarahisar", "Çocuk havuzu", "Termal"],
      voice: "“Kapalı havuz akşam kaça kadar açık?”",
    },
  },
};

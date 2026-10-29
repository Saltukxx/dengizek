// ---------------------------------------------------------------------------
// Reklam dönüşüm kodları (Google Ads / GA4) — saf mantık, istemci + sunucu.
//
// Kodları yalnız platform admini girer (/admin/reklam). Her kayıt ya bir
// genel sayfaya (ana sayfa, /kis, /otel-bul…) ya da bir otele bağlıdır. Otel
// kodu o otelin tüm sayfalarında (otel, oda, tur, talep) yüklenir.
//
// Dönüşüm = talep gönderimi. Tetiklenen kodlar: misafirin oturumda GİRDİĞİ
// genel sayfanın kodları + talebin gittiği otelin kodları (aynı kod bir kez).
//
// Serbest script yok: yalnız kimlik alanları, sıkı biçim doğrulamasıyla.
// ---------------------------------------------------------------------------

/** Kod bağlanabilen genel sayfalar. Otel sayfaları otel kaydıyla bağlanır. */
export const AD_TAG_PAGES = [
  { path: "/", label: "Ana sayfa (yaz)" },
  { path: "/browse", label: "Oteller (yaz)" },
  { path: "/kis", label: "Kış ana sayfa" },
  { path: "/kis/oteller", label: "Kayak otelleri" },
  { path: "/otel-bul", label: "Otel bul (arama asistanı)" },
] as const;

export type AdTagPagePath = (typeof AD_TAG_PAGES)[number]["path"];

export const AD_TAG_PAGE_PATHS = AD_TAG_PAGES.map((p) => p.path) as [AdTagPagePath, ...AdTagPagePath[]];

export const GOOGLE_ADS_ID_RE = /^AW-\d{6,15}$/;
export const CONVERSION_LABEL_RE = /^[A-Za-z0-9_-]{4,64}$/;
export const GA4_ID_RE = /^G-[A-Z0-9]{4,16}$/;

/** Misafir sayfalarına giden, yalnız gösterim için gereken alanlar. */
export interface PublicAdTag {
  /** Genel sayfa kaydıysa yolu. */
  pagePath: string | null;
  /** Otel kaydıysa otelin slug'ı. */
  hotelSlug: string | null;
  googleAdsId: string | null;
  conversionLabel: string | null;
  ga4Id: string | null;
}

/** Sayfa yolundaki otel slug'ı (otel, oda, tur sayfaları). */
export function hotelSlugFromPath(path: string): string | null {
  const match =
    path.match(/^\/hotels\/([^/?#]+)/) ?? path.match(/^\/kis\/oteller\/([^/?#]+)/) ?? path.match(/^\/tours\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/** Talep sayfası mı? (Otel slug'ı ?hotel= parametresinden okunur.) */
export function isInquiryPath(path: string): boolean {
  return path === "/inquiry" || path === "/kis/talep";
}

/** Talep başarı sayfası mı? (Dönüşüm burada tetiklenir.) */
export function isInquirySuccessPath(path: string): boolean {
  return path === "/inquiry/success" || path === "/kis/talep/basarili";
}

/** Bu sayfada yüklenecek kodlar: sayfanın kendi kaydı + sayfanın otelinin kaydı. */
export function tagsForPage(tags: PublicAdTag[], path: string, hotelSlug: string | null): PublicAdTag[] {
  return tags.filter((t) => (t.pagePath !== null && t.pagePath === path) || (hotelSlug !== null && t.hotelSlug === hotelSlug));
}

/**
 * Talep dönüşümünde tetiklenecek kodlar: oturumun giriş sayfasının kaydı +
 * talebin otelinin kaydı. Giriş bir otel sayfasıysa o otelin kodu da sayılır.
 */
export function tagsForConversion(tags: PublicAdTag[], entryPath: string | null, hotelSlug: string | null): PublicAdTag[] {
  const entryHotel = entryPath ? hotelSlugFromPath(entryPath) : null;
  return tags.filter(
    (t) =>
      (t.pagePath !== null && t.pagePath === entryPath) ||
      (t.hotelSlug !== null && (t.hotelSlug === hotelSlug || t.hotelSlug === entryHotel)),
  );
}

/** gtag config'e verilecek benzersiz kimlikler (AW-… ve G-…). */
export function configIds(tags: PublicAdTag[]): string[] {
  const ids = tags.flatMap((t) => [t.googleAdsId, t.ga4Id]).filter((v): v is string => Boolean(v));
  return [...new Set(ids)];
}

/** Dönüşüm hedefleri ("AW-123/abcLabel"), benzersiz. */
export function conversionTargets(tags: PublicAdTag[]): string[] {
  const targets = tags
    .filter((t) => t.googleAdsId && t.conversionLabel)
    .map((t) => `${t.googleAdsId}/${t.conversionLabel}`);
  return [...new Set(targets)];
}

// ---------------------------------------------------------------------------
// Reklam tıklaması (kaynak) bilgisi
// ---------------------------------------------------------------------------

export interface AdAttribution {
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  /** Oturumun ilk misafir sayfası (sorgu parametresiz). */
  landingPath?: string;
}

const PARAM_KEYS: Array<[string, keyof AdAttribution]> = [
  ["gclid", "gclid"],
  ["gbraid", "gbraid"],
  ["wbraid", "wbraid"],
  ["utm_source", "utmSource"],
  ["utm_medium", "utmMedium"],
  ["utm_campaign", "utmCampaign"],
  ["utm_term", "utmTerm"],
  ["utm_content", "utmContent"],
];

const MAX_VALUE = 200;

/** URL'deki reklam parametreleri; hiçbiri yoksa null. */
export function attributionFromSearch(search: string | URLSearchParams): AdAttribution | null {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const out: AdAttribution = {};
  for (const [param, key] of PARAM_KEYS) {
    const value = params.get(param)?.trim();
    if (value) out[key] = value.slice(0, MAX_VALUE);
  }
  return Object.keys(out).length ? out : null;
}

/** Panelde kısa kaynak etiketi: "google / cpc · yaz-kampanya" ya da "Google Ads". */
export function attributionLabel(attribution: AdAttribution | null | undefined): string | null {
  if (!attribution) return null;
  const utm = [attribution.utmSource, attribution.utmMedium].filter(Boolean).join(" / ");
  const parts = [utm || (attribution.gclid || attribution.gbraid || attribution.wbraid ? "Google Ads" : ""), attribution.utmCampaign]
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : attribution.landingPath ? `Giriş: ${attribution.landingPath}` : null;
}

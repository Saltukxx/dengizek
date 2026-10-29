// ---------------------------------------------------------------------------
// Reklam kodları — tarayıcı tarafı (gtag yükleme, kaynak, dönüşüm devri).
//
// Onay kuralı (bkz. lib/consent): gtag.js YALNIZ analitik onayı verilmişse
// yüklenir; kaynak bilgisi sunucuya yalnız onayla gider. Reklam parametreleri
// onaydan önce yalnız sessionStorage'da (oturum kapanınca silinir) tutulur ki
// misafir sonradan onay verirse geldiği reklam kaybolmasın.
// ---------------------------------------------------------------------------

import { hasAnalyticsConsent } from "@/lib/consent";
import { attributionFromSearch, type AdAttribution } from "@/lib/ad-tags";

const ATTR_KEY = "otelsayfam_ad_attr";
const PENDING_KEY = "otelsayfam_conv_pending";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function session(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function readJson<T>(key: string): T | null {
  try {
    const raw = session()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    session()?.setItem(key, JSON.stringify(value));
  } catch {
    // Depolama kapalı: kaynak bilgisi tutulamaz, sayfa çalışmaya devam eder.
  }
}

/**
 * Sayfa açılışında: URL'de reklam parametresi varsa yeni tıklama sayılır
 * (giriş sayfası bu sayfa olur); yoksa oturumun ilk sayfası giriş sayfasıdır.
 */
export function captureAttribution(path: string, search: string): AdAttribution {
  const fromUrl = attributionFromSearch(search);
  const stored = readJson<AdAttribution>(ATTR_KEY);
  const next = fromUrl ? { ...fromUrl, landingPath: path } : stored ?? { landingPath: path };
  if (next !== stored) writeJson(ATTR_KEY, next);
  return next;
}

export function readAttribution(): AdAttribution | null {
  return readJson<AdAttribution>(ATTR_KEY);
}

/** Talep gönderiminde sunucuya gidecek kaynak — onay yoksa hiç gönderilmez. */
export function attributionForSubmit(): AdAttribution | undefined {
  if (!hasAnalyticsConsent()) return undefined;
  return readAttribution() ?? undefined;
}

/** Talep kaydedildi: dönüşüm başarı sayfasında bir kez tetiklenir. */
export function rememberInquiryConversion(inquiryId: string, hotelSlug: string | undefined): void {
  writeJson(PENDING_KEY, { inquiryId, hotelSlug: hotelSlug ?? null });
}

/** Bekleyen dönüşümü alır ve siler (sayfa yenilenince ikinci kez sayılmaz). */
export function takePendingConversion(): { inquiryId: string; hotelSlug: string | null } | null {
  const pending = readJson<{ inquiryId: string; hotelSlug: string | null }>(PENDING_KEY);
  try {
    session()?.removeItem(PENDING_KEY);
  } catch {
    // yoksay
  }
  return pending?.inquiryId ? pending : null;
}

// ---------------------------------------------------------------------------
// gtag
// ---------------------------------------------------------------------------

const configured = new Set<string>();

/** gtag.js'i bir kez yükler. Yalnız onay varken çağrılır. */
function ensureGtag(firstId: string): (...args: unknown[]) => void {
  if (window.gtag) return window.gtag;
  window.dataLayer = window.dataLayer ?? [];
  // gtag, dataLayer'a dizi değil `arguments` nesnesi bekler.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  // Onay verildi: ölçüm açık, kişiselleştirilmiş reklam (yeniden pazarlama)
  // onay metninde olmadığı için kapalı.
  window.gtag("consent", "default", {
    ad_storage: "granted",
    analytics_storage: "granted",
    ad_user_data: "granted",
    ad_personalization: "denied",
  });
  window.gtag("js", new Date());
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(firstId)}`;
  document.head.appendChild(script);
  return window.gtag;
}

/** Sayfanın kimliklerini yapılandırır; GA4 için sayfa görüntülemesi gönderir. */
export function configureTags(ids: string[], path: string): void {
  if (!ids.length || !hasAnalyticsConsent()) return;
  const gtag = ensureGtag(ids[0]!);
  for (const id of ids) {
    gtag("config", id, { page_path: path });
    configured.add(id);
  }
}

/** Dönüşümü gönderir. transaction_id aynı talebin iki kez sayılmasını önler. */
export function sendConversions(ids: string[], targets: string[], ga4Ids: string[], inquiryId: string): void {
  if (!hasAnalyticsConsent() || (!targets.length && !ga4Ids.length)) return;
  const gtag = ensureGtag(ids[0]!);
  for (const id of ids) {
    if (!configured.has(id)) {
      gtag("config", id, { send_page_view: false });
      configured.add(id);
    }
  }
  for (const target of targets) gtag("event", "conversion", { send_to: target, transaction_id: inquiryId });
  for (const ga4 of ga4Ids) gtag("event", "generate_lead", { send_to: ga4, transaction_id: inquiryId });
}

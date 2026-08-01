// ---------------------------------------------------------------------------
// Analitik onayı (GDPR / KVKK)
//
// Ana plan: "GDPR (if EU): lawful basis for marketing, export/delete,
// cookie consent." Varsayılan REDDET — kullanıcı açıkça kabul etmeden hiçbir
// analitik olayı gönderilmez.
//
// Kapsam ayrımı:
//  - İSTEMCİ analitiği (tur adım görüntüleme, AI araç kullanımı vb.) ziyaretçi
//    davranışını izler → ONAY GEREKTİRİR.
//  - SUNUCU tarafı trackEvent (AI token maliyeti, guard tetiklenmesi) işletme
//    metriğidir, kişisel veri içermez → meşru menfaat, onaydan bağımsız.
// ---------------------------------------------------------------------------

export const CONSENT_STORAGE_KEY = "dengizek_analytics_consent";
export type ConsentValue = "granted" | "denied";

/** Tarayıcıda saklı tercih; hiç seçim yapılmamışsa null. */
export function readConsent(): ConsentValue | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    return raw === "granted" || raw === "denied" ? raw : null;
  } catch {
    // localStorage kapalı (gizli sekme) — onay yok say, izleme yapma.
    return null;
  }
}

export function writeConsent(value: ConsentValue): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, value);
    window.dispatchEvent(new CustomEvent("dengizek:consent", { detail: value }));
  } catch {
    // Yazılamıyorsa sessiz geç — varsayılan "izleme yok" güvenli tarafta.
  }
}

/** Analitik gönderilebilir mi? Yalnızca AÇIK onayda true. */
export function hasAnalyticsConsent(): boolean {
  return readConsent() === "granted";
}

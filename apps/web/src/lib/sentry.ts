// ---------------------------------------------------------------------------
// Sentry başlatma — DSN yoksa TAMAMEN no-op.
//
// Ana planın "hardening" todo'su. Mevcut yapılandırılmış JSON loglama
// (instrumentation.ts onRequestError) korunur; Sentry onun üstüne ek katmandır,
// yerine geçmez.
//
// Gizlilik: sendDefaultPii kapalı. Ayrıca portal/reset token'ları ve e-posta
// adresleri URL'lerde geçebildiği için beforeSend'de maskelenir — hata takibi
// için kişisel veri toplamak gerekmiyor.
// ---------------------------------------------------------------------------

import type { ErrorEvent } from "@sentry/nextjs";

/** URL'lerde gizlenmesi gereken query parametreleri. */
const SENSITIVE_QUERY_KEYS = new Set(["token", "access_token", "email", "e-posta", "secret"]);

/** /inquiry/portal/<token> ve /sifremi-sifirla/<token> gibi yol içi sırlar. */
const SENSITIVE_PATH_PATTERNS: [RegExp, string][] = [
  [/\/inquiry\/portal\/[^/?#]+/gi, "/inquiry/portal/[token]"],
  [/\/sifremi-sifirla\/[^/?#]+/gi, "/sifremi-sifirla/[token]"],
  [/\/api\/inquiry\/portal\/[^/?#]+/gi, "/api/inquiry/portal/[token]"],
  [/\/api\/ical\/export\/[^/?#]+/gi, "/api/ical/export/[token]"],
];

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

/** Hata mesajlarında veya breadcrumb'larda kalmış e-posta ve URL sırlarını temizler. */
export function scrubText(raw: string): string {
  return scrubUrl(raw).replace(EMAIL_PATTERN, "[e-posta]");
}

/** URL'deki hassas yol parçalarını ve query değerlerini maskeler. */
export function scrubUrl(raw: string): string {
  let out = raw;
  for (const [pattern, replacement] of SENSITIVE_PATH_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  // Query değerlerini maskele (URL parse edilemezse ham string üzerinde bırak).
  const qIndex = out.indexOf("?");
  if (qIndex === -1) return out;
  const [base, query] = [out.slice(0, qIndex), out.slice(qIndex + 1)];
  const masked = query
    .split("&")
    .map((pair) => {
      const eq = pair.indexOf("=");
      if (eq === -1) return pair;
      const key = pair.slice(0, eq);
      return SENSITIVE_QUERY_KEYS.has(key.toLowerCase()) ? `${key}=[gizlendi]` : pair;
    })
    .join("&");
  return `${base}?${masked}`;
}

/** Sentry'ye gitmeden önce olayı temizler. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request?.url) event.request.url = scrubUrl(event.request.url);
  if (event.request?.query_string && typeof event.request.query_string === "string") {
    event.request.query_string = scrubUrl(`?${event.request.query_string}`).replace(/^\?/, "");
  }
  // Çerezler ve başlıklar oturum bilgisi taşır — hiç göndermeyelim.
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.data;
  }
  // Kullanıcı nesnesi, sendDefaultPii=false olsa bile uygulama kodu tarafından
  // elle eklenmiş olabilir. Hata takibi için kimlik bilgisine ihtiyacımız yok.
  delete event.user;
  if (event.message) event.message = scrubText(event.message);
  if (event.logentry?.message) event.logentry.message = scrubText(event.logentry.message);
  for (const value of event.exception?.values ?? []) {
    if (value.value) value.value = scrubText(value.value);
  }
  for (const breadcrumb of event.breadcrumbs ?? []) {
    if (breadcrumb.message) breadcrumb.message = scrubText(breadcrumb.message);
    if (typeof breadcrumb.data?.url === "string") {
      breadcrumb.data.url = scrubUrl(breadcrumb.data.url);
    }
  }
  return event;
}

export function isSentryEnabled(): boolean {
  return Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);
}

/** Sunucu/edge tarafı başlatma — instrumentation.register() içinden çağrılır. */
export async function initSentryServer(): Promise<void> {
  if (!isSentryEnabled()) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init({
    dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE ?? process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    // PII toplamıyoruz — hata ayıklama için gerekmiyor, GDPR yüzeyini büyütür.
    sendDefaultPii: false,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    beforeSend: scrubEvent,
  });
}

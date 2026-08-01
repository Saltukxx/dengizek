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
    // PII toplamıyoruz — hata ayıklama için gerekmiyor, GDPR yüzeyini büyütür.
    sendDefaultPii: false,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    beforeSend: scrubEvent,
  });
}

// Tarayıcı tarafı Sentry başlangıcı. Public DSN yoksa SDK hiç indirilmez
// (statik import her sayfaya ~66 KB ekliyordu); yerel geliştirme ve test için
// Sentry hesabı gerekmez. DSN varsa SDK ayrı parça olarak arka planda yüklenir.

type SentryModule = typeof import("@sentry/nextjs");

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
let sentry: SentryModule | null = null;

if (dsn) {
  void Promise.all([import("@sentry/nextjs"), import("@/lib/sentry")]).then(([Sentry, { scrubEvent }]) => {
    Sentry.init({
      dsn,
      environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
      release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
      sendDefaultPii: false,
      tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0),
      beforeSend: scrubEvent,
    });
    sentry = Sentry;
  });
}

export function onRouterTransitionStart(...args: Parameters<SentryModule["captureRouterTransitionStart"]>) {
  sentry?.captureRouterTransitionStart(...args);
}

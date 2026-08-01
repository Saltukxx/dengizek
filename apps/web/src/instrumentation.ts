// ---------------------------------------------------------------------------
// Next.js instrumentation — sunucu boot'unda env doğrulaması ve
// yakalanmamış istek hatalarının yapılandırılmış loglanması.
//
// onRequestError çıktısı tek satır JSON'dur — Vercel log drain / Datadog /
// Axiom gibi araçlar doğrudan parse edebilir. Sentry bunun YERİNE geçmez,
// üstüne eklenir; SENTRY_DSN yoksa tamamen devre dışıdır.
// ---------------------------------------------------------------------------

import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertEnv } = await import("@/env");
    assertEnv();
  }
  const { initSentryServer } = await import("@/lib/sentry");
  await initSentryServer();
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const err = error instanceof Error ? error : new Error(String(error));

  // Sentry'ye ilet (DSN yoksa import edilmez bile). Hata takibi loglamayı
  // engellemesin diye ayrı try/catch.
  try {
    const { isSentryEnabled } = await import("@/lib/sentry");
    if (isSentryEnabled()) {
      const Sentry = await import("@sentry/nextjs");
      Sentry.captureException(err);
    }
  } catch {
    // Sentry ulaşılamıyorsa sessiz geç — aşağıdaki log her hâlükârda yazılır.
  }

  console.error(
    JSON.stringify({
      level: "error",
      source: "onRequestError",
      message: err.message,
      // Stack yalnızca loga yazılır — istemciye asla dönmez.
      stack: err.stack,
      digest: (err as { digest?: string }).digest,
      path: request.path,
      method: request.method,
      routerKind: context.routerKind,
      routeType: context.routeType,
      timestamp: new Date().toISOString(),
    }),
  );
};

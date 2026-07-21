// ---------------------------------------------------------------------------
// Next.js instrumentation — sunucu boot'unda env doğrulaması ve
// yakalanmamış istek hatalarının yapılandırılmış loglanması.
//
// onRequestError çıktısı tek satır JSON'dur — Vercel log drain / Datadog /
// Axiom gibi araçlar doğrudan parse edebilir. Sentry eklenmek istenirse
// SDK çağrısı bu hook'a bağlanır.
// ---------------------------------------------------------------------------

import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertEnv } = await import("@/env");
    assertEnv();
  }
}

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const err = error instanceof Error ? error : new Error(String(error));
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

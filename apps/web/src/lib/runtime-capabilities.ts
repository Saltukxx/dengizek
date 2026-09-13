export type ServiceStatus = "ready" | "unavailable" | "development";

export interface RuntimeCapabilities {
  payments: boolean;
  paymentState: "ready" | "planned";
  services: {
    video: ServiceStatus;
    ai: ServiceStatus;
    email: ServiceStatus;
    imageStorage: ServiceStatus;
    scheduledJobs: ServiceStatus;
  };
}

function configured(...names: string[]) {
  return names.every((name) => Boolean(process.env[name]?.trim()));
}

/** Mock/yerel fallback yalnız geliştirme ve açık test modunda kullanılabilir. */
export function developmentFallbackEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.USE_MOCK_DATA === "true";
}

function providerStatus(ready: boolean): ServiceStatus {
  if (ready) return "ready";
  return developmentFallbackEnabled() ? "development" : "unavailable";
}

/** İstemciye sır veya sağlayıcı ayrıntısı sızdırmayan çalışma zamanı özeti. */
export function getRuntimeCapabilities(): RuntimeCapabilities {
  const payments =
    process.env.PAYMENTS_ENABLED === "true" && configured("STRIPE_SECRET_KEY");

  return {
    payments,
    paymentState: payments ? "ready" : "planned",
    services: {
      video: providerStatus(
        configured(
          "BUNNY_STREAM_API_KEY",
          "BUNNY_STREAM_LIBRARY_ID",
          "BUNNY_STREAM_CDN_HOSTNAME",
          "BUNNY_WEBHOOK_SECRET",
        ),
      ),
      ai: providerStatus(configured("OPENAI_API_KEY")),
      email: providerStatus(configured("RESEND_API_KEY", "EMAIL_FROM", "CRON_SECRET")),
      imageStorage: providerStatus(
        configured(
          "R2_ENDPOINT",
          "R2_BUCKET_NAME",
          "R2_ACCESS_KEY_ID",
          "R2_SECRET_ACCESS_KEY",
          "R2_PUBLIC_URL",
        ),
      ),
      scheduledJobs: providerStatus(configured("CRON_SECRET")),
    },
  };
}

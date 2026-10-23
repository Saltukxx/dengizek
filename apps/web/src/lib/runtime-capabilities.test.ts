import { afterEach, describe, expect, it, vi } from "vitest";
import { developmentFallbackEnabled, getRuntimeCapabilities } from "./runtime-capabilities";

const providerVariables = [
  "PAYMENTS_ENABLED",
  "STRIPE_SECRET_KEY",
  "BUNNY_STREAM_API_KEY",
  "BUNNY_STREAM_LIBRARY_ID",
  "BUNNY_STREAM_CDN_HOSTNAME",
  "BUNNY_WEBHOOK_SECRET",
  "GEMINI_API_KEY",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "CRON_SECRET",
  "R2_ENDPOINT",
  "R2_BUCKET_NAME",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_PUBLIC_URL",
] as const;

function clearProviders() {
  for (const name of providerVariables) vi.stubEnv(name, "");
}

afterEach(() => vi.unstubAllEnvs());

describe("runtime capabilities", () => {
  it("üretimde yapılandırılmamış servisleri unavailable ve ödemeyi planned gösterir", () => {
    clearProviders();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("USE_MOCK_DATA", "false");

    expect(developmentFallbackEnabled()).toBe(false);
    expect(getRuntimeCapabilities()).toEqual({
      payments: false,
      paymentState: "planned",
      services: {
        video: "unavailable",
        ai: "unavailable",
        email: "unavailable",
        imageStorage: "unavailable",
        scheduledJobs: "unavailable",
      },
    });
  });

  it("geliştirmede eksik servisleri açıkça development olarak işaretler", () => {
    clearProviders();
    vi.stubEnv("NODE_ENV", "development");

    expect(getRuntimeCapabilities().services).toEqual({
      video: "development",
      ai: "development",
      email: "development",
      imageStorage: "development",
      scheduledJobs: "development",
    });
  });

  it("yalnız eksiksiz yapılandırılmış servisleri ready yapar ve sırları yanıta katmaz", () => {
    for (const name of providerVariables) vi.stubEnv(name, name === "PAYMENTS_ENABLED" ? "true" : `secret-${name}`);
    vi.stubEnv("NODE_ENV", "production");

    const capabilities = getRuntimeCapabilities();

    expect(capabilities).toEqual({
      payments: true,
      paymentState: "ready",
      services: {
        video: "ready",
        ai: "ready",
        email: "ready",
        imageStorage: "ready",
        scheduledJobs: "ready",
      },
    });
    expect(JSON.stringify(capabilities)).not.toContain("secret-");
  });
});

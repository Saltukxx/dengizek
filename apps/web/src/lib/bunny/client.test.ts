import { afterEach, describe, expect, it, vi } from "vitest";
import { createVideo } from "./client";

afterEach(() => vi.unstubAllEnvs());

describe("Bunny video fallback", () => {
  it("üretimde yapılandırma yoksa mock kayıt üretmez", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("USE_MOCK_DATA", "false");
    vi.stubEnv("BUNNY_STREAM_API_KEY", "");
    vi.stubEnv("BUNNY_STREAM_LIBRARY_ID", "");

    await expect(createVideo("Kış turu")).rejects.toThrow("BUNNY_NOT_CONFIGURED");
  });

  it("geliştirmede fallback kaydını açıkça mock olarak döndürür", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BUNNY_STREAM_API_KEY", "");
    vi.stubEnv("BUNNY_STREAM_LIBRARY_ID", "");

    await expect(createVideo("Kış turu")).resolves.toMatchObject({ mock: true });
  });
});

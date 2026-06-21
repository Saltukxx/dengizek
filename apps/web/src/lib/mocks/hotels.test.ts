import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/manifest", () => ({
  getPublishedManifest: vi.fn(async () => {
    throw new Error("DB bağlantı hatası");
  }),
}));

describe("getTourManifest production mock", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://test");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("production'da DB hatasında mock'a düşmez", async () => {
    const { getTourManifest } = await import("@/lib/mocks/hotels");
    await expect(getTourManifest("aurelia-bay", "demo-lobby")).rejects.toThrow(
      "DB bağlantı hatası",
    );
  });
});

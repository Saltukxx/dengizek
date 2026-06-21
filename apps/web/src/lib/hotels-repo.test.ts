import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: () => {
    throw new Error("DB bağlantı hatası");
  },
  isDbConfigured: () => true,
}));

describe("hotels-repo production mock", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://test");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("production'da DB hatasında mock'a düşmez", async () => {
    const { getPublishedHotels } = await import("@/lib/hotels-repo");
    await expect(getPublishedHotels()).rejects.toThrow("DB bağlantı hatası");
  });
});

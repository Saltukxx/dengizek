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
    const { getPublishedHotelsForBrowse } = await import("@/lib/hotels-repo");
    await expect(getPublishedHotelsForBrowse()).rejects.toThrow("DB bağlantı hatası");
  });
});

describe("matchesSeason", () => {
  it("sezon verilmezse her tesis geçer", async () => {
    const { matchesSeason } = await import("@/lib/hotels-repo");
    expect(matchesSeason(["kis"], undefined)).toBe(true);
    expect(matchesSeason([], undefined)).toBe(true);
  });

  it("sezonu belirtilmemiş eski tesis yazdan düşmez, kış vitrinine girmez", async () => {
    const { matchesSeason } = await import("@/lib/hotels-repo");
    expect(matchesSeason([], "yaz")).toBe(true);
    expect(matchesSeason([], "kis")).toBe(false);
    expect(matchesSeason(null, "kis")).toBe(false);
  });

  it("kış vitrini yalnızca kis seçilmiş tesisleri kabul eder", async () => {
    const { matchesSeason } = await import("@/lib/hotels-repo");
    expect(matchesSeason(["kis"], "kis")).toBe(true);
    expect(matchesSeason(["yaz"], "yaz")).toBe(true);
    expect(matchesSeason(["yaz"], "kis")).toBe(false);
  });

  it("iki sezonlu tesis her iki listede de görünür", async () => {
    const { matchesSeason } = await import("@/lib/hotels-repo");
    expect(matchesSeason(["yaz", "kis"], "yaz")).toBe(true);
    expect(matchesSeason(["yaz", "kis"], "kis")).toBe(true);
  });
});

describe("getPublishedHotelsForBrowse sezon koruması", () => {
  it("mock fallback'teki sezonsuz eski tesisleri kış vitrininden çıkarır", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "");
    vi.resetModules();

    const { getPublishedHotelsForBrowse } = await import("@/lib/hotels-repo");
    const summerHotels = await getPublishedHotelsForBrowse();
    const winterHotels = await getPublishedHotelsForBrowse({ season: "kis" });

    expect(summerHotels.length).toBeGreaterThan(0);
    expect(winterHotels).toEqual([]);
  });
});

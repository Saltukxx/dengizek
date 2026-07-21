// ---------------------------------------------------------------------------
// AI bağlam testleri — otel AI profili yalnızca publishedSnapshot'tan okunur
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const selectRowsMock = vi.fn();
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => selectRowsMock(),
        }),
      }),
    }),
  }),
}));

const legacySnapshotFallbackEnabledMock = vi.fn();
vi.mock("@/lib/hotels-repo", () => ({
  legacySnapshotFallbackEnabled: () => legacySnapshotFallbackEnabledMock(),
}));

import { getHotelAiProfile } from "./ai-context";

const liveRow = {
  publishedSnapshot: null as unknown,
  aiPersona: "Canlı Persona (yayınlanmamış)",
  aiLanguage: "en",
  aiFacts: ["canlı fact"],
  aiPolicies: ["canlı policy"],
};

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://test");
  selectRowsMock.mockReset();
  legacySnapshotFallbackEnabledMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getHotelAiProfile", () => {
  it("DATABASE_URL yoksa undefined döner", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const profile = await getHotelAiProfile("aurelia-bay");
    expect(profile).toBeUndefined();
    expect(selectRowsMock).not.toHaveBeenCalled();
  });

  it("otel bulunamazsa undefined döner", async () => {
    selectRowsMock.mockResolvedValue([]);
    const profile = await getHotelAiProfile("bilinmeyen-otel");
    expect(profile).toBeUndefined();
  });

  it("publishedSnapshot varsa yalnızca snapshot içeriğini kullanır (canlı taslak yok sayılır)", async () => {
    selectRowsMock.mockResolvedValue([
      {
        ...liveRow,
        publishedSnapshot: {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          hotel: {
            aiPersona: "Yayındaki Persona",
            aiLanguage: "tr",
            aiFacts: ["yayındaki fact"],
            aiPolicies: ["yayındaki policy"],
          },
          rooms: [],
          roomRates: [],
          restaurants: [],
          extras: [],
          gallery: [],
          availabilityNotes: [],
          cancellationRules: [],
          ratePlans: [],
          ratePlanPrices: [],
          promotions: [],
        },
      },
    ]);
    const profile = await getHotelAiProfile("aurelia-bay");
    expect(profile).toEqual({
      aiPersona: "Yayındaki Persona",
      language: "tr",
      facts: ["yayındaki fact"],
      policies: ["yayındaki policy"],
    });
    // Onaydan geçmemiş canlı satırdaki değerler asla sızmamalı
    expect(profile?.aiPersona).not.toBe(liveRow.aiPersona);
  });

  it("snapshot'ta boş facts/policies varsa undefined'a normalize eder", async () => {
    selectRowsMock.mockResolvedValue([
      {
        ...liveRow,
        publishedSnapshot: {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          hotel: { aiPersona: "Yayındaki Persona", aiLanguage: "tr", aiFacts: [], aiPolicies: [] },
          rooms: [], roomRates: [], restaurants: [], extras: [], gallery: [],
          availabilityNotes: [], cancellationRules: [], ratePlans: [], ratePlanPrices: [], promotions: [],
        },
      },
    ]);
    const profile = await getHotelAiProfile("aurelia-bay");
    expect(profile?.facts).toBeUndefined();
    expect(profile?.policies).toBeUndefined();
  });

  it("publishedSnapshot yoksa ve legacy fallback açıksa canlı satıra düşer", async () => {
    selectRowsMock.mockResolvedValue([liveRow]);
    legacySnapshotFallbackEnabledMock.mockReturnValue(true);
    const profile = await getHotelAiProfile("aurelia-bay");
    expect(profile).toEqual({
      aiPersona: "Canlı Persona (yayınlanmamış)",
      language: "en",
      facts: ["canlı fact"],
      policies: ["canlı policy"],
    });
  });

  it("publishedSnapshot yoksa ve legacy fallback kapalıysa (prod) undefined döner", async () => {
    selectRowsMock.mockResolvedValue([liveRow]);
    legacySnapshotFallbackEnabledMock.mockReturnValue(false);
    const profile = await getHotelAiProfile("aurelia-bay");
    expect(profile).toBeUndefined();
  });

  it("DB hatasında undefined döner (misafir akışı bozulmaz)", async () => {
    selectRowsMock.mockRejectedValue(new Error("db down"));
    const profile = await getHotelAiProfile("aurelia-bay");
    expect(profile).toBeUndefined();
  });
});

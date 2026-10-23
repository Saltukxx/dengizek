// ---------------------------------------------------------------------------
// AI metrikleri route testi — token kullanımı agregasyonu odaklı
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it, vi } from "vitest";

const requireHotelAccessMock = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireHotelAccess: (...args: unknown[]) => requireHotelAccessMock(...args),
}));

const selectQueue: unknown[] = [];
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(selectQueue.shift() ?? []),
      }),
    }),
  }),
}));

// Gerçek implementasyon DB + fact kataloğuna gider; bu test selectQueue
// mock'unun sırasını bozmamak için sabit bir özet döner.
const freshnessMock = vi.fn();
vi.mock("@/lib/ai/fact-store", () => ({
  computeFactEmbeddingFreshness: (...args: unknown[]) => freshnessMock(...args),
}));

import { GET } from "./route";

const okGuard = {
  user: { id: "u1", email: "y@a.dev", name: "Y", role: "manager" as const },
  hotel: {
    id: "hotel-1",
    slug: "aurelia-bay",
    aiPersona: "Yapay Zeka Rehberi",
    cancellationPolicy: null,
    aiPolicies: [],
  },
  response: null,
};

function makeParams() {
  return { params: Promise.resolve({ hotelId: "aurelia-bay" }) };
}

beforeEach(() => {
  requireHotelAccessMock.mockReset();
  selectQueue.length = 0;
  freshnessMock.mockReset().mockResolvedValue({
    totalFacts: 4,
    embedded: 3,
    missingOrStale: 1,
    orphaned: 0,
  });
});

describe("GET /api/manager/hotels/[hotelId]/ai-metrics", () => {
  it("ai_usage event'lerini toplayıp tokenUsage olarak döner", async () => {
    requireHotelAccessMock.mockResolvedValue(okGuard);
    // sıra: publishedTours, events, rooms (yayında tur yok -> steps sorgusu atlanır)
    selectQueue.push(
      [], // publishedTours
      [
        { eventType: "ai_usage", payload: { inputTokens: 10_000, outputTokens: 2_000 } },
        { eventType: "ai_usage", payload: { inputTokens: 5_000, outputTokens: 1_000 } },
        { eventType: "ai_tool_price", payload: {} },
      ],
      [], // rooms
    );

    const res = await GET(new Request("http://localhost"), makeParams());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tokenUsage.inputTokens).toBe(15_000);
    expect(json.tokenUsage.outputTokens).toBe(3_000);
    expect(json.embeddingFreshness).toEqual({
      totalFacts: 4,
      embedded: 3,
      missingOrStale: 1,
      orphaned: 0,
    });
  });

  it("hiç ai_usage event'i yoksa sıfır döner", async () => {
    requireHotelAccessMock.mockResolvedValue(okGuard);
    selectQueue.push([], [], []);

    const res = await GET(new Request("http://localhost"), makeParams());
    const json = await res.json();
    expect(json.tokenUsage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});

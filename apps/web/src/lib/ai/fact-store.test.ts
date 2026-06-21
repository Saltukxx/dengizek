import { beforeEach, describe, expect, it, vi } from "vitest";
import { FACT_KIND_LABELS } from "@/lib/ai/types";

vi.mock("@/lib/db/ai-context", () => ({
  getHotelAiProfile: vi.fn(),
}));

vi.mock("@/lib/hotels-repo", () => ({
  getPublishedHotelContent: vi.fn(),
}));

import { getHotelAiProfile } from "@/lib/db/ai-context";
import { getPublishedHotelContent } from "@/lib/hotels-repo";
import { buildFactCatalog, citeFactById, clearFactCatalogCache } from "@/lib/ai/fact-store";

describe("buildFactCatalog", () => {
  beforeEach(() => {
    clearFactCatalogCache();
  });

  it("manuel aiFacts otel ifadesi olarak etiketlenir", async () => {
    vi.mocked(getHotelAiProfile).mockResolvedValue({
      aiPersona: "Rehber",
      language: "tr",
      facts: ["Deniz manzarası eşsizdir."],
      policies: [],
    });
    vi.mocked(getPublishedHotelContent).mockResolvedValue({
      rooms: [],
      restaurants: [],
      extras: [],
      amenities: [],
      specs: {
        starRating: null,
        totalRooms: null,
        checkInTime: null,
        checkOutTime: null,
        cancellationPolicy: null,
        childPolicy: null,
        petsAllowed: null,
        paymentMethods: [],
        address: null,
        phone: null,
        contactEmail: null,
        airportDistanceKm: null,
        blackoutText: null,
      },
      gallery: [],
      latitude: null,
      longitude: null,
      availabilityNotes: [],
      promotions: [],
      ratePlanPrices: [],
    });

    const catalog = await buildFactCatalog("test-hotel");
    const statement = catalog.find((e) => e.id === "statement.0");
    expect(statement?.kind).toBe("otel_ifadesi");
    expect(statement?.text).toBe("Deniz manzarası eşsizdir.");
  });
});

describe("citeFactById", () => {
  it("kart etiketini kind ile döner", async () => {
    const catalog = [
      {
        id: "statement.0",
        kind: "otel_ifadesi" as const,
        hint: "test",
        text: "Otel ifadesi metni",
      },
    ];
    const result = await citeFactById("x", "statement.0", catalog);
    expect(result.ok).toBe(true);
    expect(result.card?.label).toBe(FACT_KIND_LABELS.otel_ifadesi);
    expect(result.card?.text).toBe("Otel ifadesi metni");
  });
});

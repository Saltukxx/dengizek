import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatPrice } from "@/lib/price";
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
import { queryRoomPrices } from "@/lib/ai/price-engine";

const emptySpecs = {
  starRating: null,
  totalRooms: null,
  checkInTime: null,
  checkOutTime: null,
  cancellationPolicy: null,
  childPolicy: null,
  petsAllowed: false,
  paymentMethods: [],
  address: null,
  phone: null,
  contactEmail: null,
  airportDistanceKm: null,
  blackoutText: null,
};

const room = {
  id: "room-1",
  slug: "deluxe",
  name: "Deluxe Deniz",
  priceMinor: 450000,
  currency: "TRY",
  priceOnRequest: false,
  discountPercent: null,
  discountLabel: null,
  minStayNights: null,
  boardType: "sadece-oda",
  rates: [],
  capacityAdults: 2,
  capacityChildren: 0,
};

describe("golden price/fact queries", () => {
  beforeEach(() => {
    clearFactCatalogCache();
    vi.clearAllMocks();
  });

  it("queryRoomPrices formatPrice ile byte-eşleşir", async () => {
    vi.mocked(getPublishedHotelContent).mockResolvedValue({
      rooms: [room as never],
      restaurants: [],
      extras: [],
      amenities: [],
      specs: emptySpecs,
      gallery: [],
      latitude: null,
      longitude: null,
      availabilityNotes: [],
      promotions: [],
      ratePlanPrices: [],
    });

    const result = await queryRoomPrices("aurelia-bay", { roomSlug: "deluxe" });
    expect(result.ok).toBe(true);
    expect(result.cards[0]?.lines[0]?.value).toBe(formatPrice(450000, "TRY", false));
  });

  it("citeFactById policy.pets sabit metin döner", async () => {
    vi.mocked(getHotelAiProfile).mockResolvedValue({
      aiPersona: "Rehber",
      language: "tr",
      facts: [],
      policies: [],
    });
    vi.mocked(getPublishedHotelContent).mockResolvedValue({
      rooms: [],
      restaurants: [],
      extras: [],
      amenities: [],
      specs: { ...emptySpecs, petsAllowed: false },
      gallery: [],
      latitude: null,
      longitude: null,
      availabilityNotes: [],
      promotions: [],
      ratePlanPrices: [],
    });

    const catalog = await buildFactCatalog("test-hotel");
    const result = await citeFactById("test-hotel", "policy.pets", catalog);
    expect(result.ok).toBe(true);
    expect(result.card?.text).toBe("Evcil hayvan kabul edilmez.");
  });

  it("buildFactCatalog statement.* kind otel_ifadesi", async () => {
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
      specs: emptySpecs,
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
    expect(FACT_KIND_LABELS[statement!.kind]).toBe("Otel ifadesi");
  });
});

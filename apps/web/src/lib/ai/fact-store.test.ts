import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FACT_KIND_LABELS } from "@/lib/ai/types";

vi.mock("@/lib/db/ai-context", () => ({
  getHotelAiProfile: vi.fn(),
}));

vi.mock("@/lib/hotels-repo", () => ({
  getPublishedHotelContent: vi.fn(),
}));

const embedTextMock = vi.fn();
vi.mock("@/lib/ai/embeddings", () => ({
  embedText: (...args: unknown[]) => embedTextMock(...args),
}));

const selectResultMock = vi.fn();
const insertMock = vi.fn();
const deleteMock = vi.fn();
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => selectResultMock() }) }),
    insert: () => ({
      values: (v: unknown) => ({ onConflictDoUpdate: (opts: unknown) => insertMock(v, opts) }),
    }),
    delete: () => ({ where: (w: unknown) => deleteMock(w) }),
  }),
}));

import { getHotelAiProfile } from "@/lib/db/ai-context";
import { getPublishedHotelContent } from "@/lib/hotels-repo";
import { buildFactCatalog, citeFactById, clearFactCatalogCache, computeFactEmbeddingFreshness, syncFactEmbeddings } from "@/lib/ai/fact-store";

const emptySpecs = {
  starRating: null,
  totalRooms: null,
  checkInTime: null,
  checkOutTime: null,
  cancellationPolicy: null,
  childPolicy: null,
  petsAllowed: null,
  paymentMethods: [],
  seasons: [],
  address: null,
  phone: null,
  contactEmail: null,
  airportDistanceKm: null,
  blackoutText: null,
};
const emptyContent = {
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
};

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
        seasons: [],
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

describe("syncFactEmbeddings", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgres://test");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    clearFactCatalogCache();
    selectResultMock.mockReset().mockResolvedValue([]);
    insertMock.mockReset();
    deleteMock.mockReset();
    embedTextMock.mockReset().mockResolvedValue([0.1, 0.2, 0.3]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("DATABASE_URL veya OPENAI_API_KEY yoksa hiçbir şey yapmadan çıkar", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.mocked(getHotelAiProfile).mockResolvedValue(undefined);
    vi.mocked(getPublishedHotelContent).mockResolvedValue(emptyContent);
    await syncFactEmbeddings("aurelia-bay");
    expect(embedTextMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("yeni/değişen fact'leri embed edip upsert eder", async () => {
    vi.mocked(getHotelAiProfile).mockResolvedValue({
      aiPersona: "Rehber",
      language: "tr",
      facts: [],
      policies: [],
    });
    vi.mocked(getPublishedHotelContent).mockResolvedValue({
      ...emptyContent,
      specs: { ...emptySpecs, checkInTime: "14:00" },
    });

    await syncFactEmbeddings("aurelia-bay");

    expect(embedTextMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledTimes(1);
    const [values] = insertMock.mock.calls[0]!;
    expect(values).toMatchObject({
      hotelSlug: "aurelia-bay",
      factId: "spec.check_in",
      embedding: [0.1, 0.2, 0.3],
    });
  });

  it("contentHash değişmeyen fact'i yeniden embed etmez", async () => {
    vi.mocked(getHotelAiProfile).mockResolvedValue({
      aiPersona: "Rehber",
      language: "tr",
      facts: [],
      policies: [],
    });
    vi.mocked(getPublishedHotelContent).mockResolvedValue({
      ...emptyContent,
      specs: { ...emptySpecs, checkInTime: "14:00" },
    });
    // aynı hash'i önceden hesaplayıp "zaten var" gibi davranmak için
    // gerçek fonksiyonu bir kez çalıştırıp insert'e giden hash'i yakalıyoruz
    await syncFactEmbeddings("aurelia-bay");
    const [firstValues] = insertMock.mock.calls[0]!;
    const existingHash = (firstValues as { contentHash: string }).contentHash;

    embedTextMock.mockClear();
    insertMock.mockClear();
    selectResultMock.mockResolvedValue([{ factId: "spec.check_in", contentHash: existingHash }]);

    await syncFactEmbeddings("aurelia-bay");
    expect(embedTextMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("kataloqdan düşen fact'in embedding'ini siler", async () => {
    vi.mocked(getHotelAiProfile).mockResolvedValue({
      aiPersona: "Rehber",
      language: "tr",
      facts: [],
      policies: [],
    });
    vi.mocked(getPublishedHotelContent).mockResolvedValue(emptyContent); // artık checkInTime yok
    selectResultMock.mockResolvedValue([{ factId: "spec.check_in", contentHash: "eski-hash" }]);

    await syncFactEmbeddings("aurelia-bay");
    expect(deleteMock).toHaveBeenCalledTimes(1);
  });

  it("computeFactEmbeddingFreshness güncel/bayat/artık sayımlarını döner", async () => {
    vi.mocked(getHotelAiProfile).mockResolvedValue({
      aiPersona: "Rehber",
      language: "tr",
      facts: [],
      policies: [],
    });
    vi.mocked(getPublishedHotelContent).mockResolvedValue({
      ...emptyContent,
      specs: { ...emptySpecs, checkInTime: "14:00", checkOutTime: "12:00" },
    });

    // Gerçek hash'i yakalamak için önce sync çalıştırıp insert değerini oku.
    await syncFactEmbeddings("aurelia-bay");
    const [values] = insertMock.mock.calls[0]!;
    const freshHash = (values as { contentHash: string }).contentHash;

    selectResultMock.mockResolvedValue([
      { factId: "spec.check_in", contentHash: freshHash }, // güncel
      { factId: "spec.check_out", contentHash: "bayat-hash" }, // bayat
      { factId: "spec.silinen", contentHash: "x" }, // katalogda yok → artık
    ]);

    const freshness = await computeFactEmbeddingFreshness("aurelia-bay");
    expect(freshness).toEqual({
      totalFacts: 2,
      embedded: 1,
      missingOrStale: 1,
      orphaned: 1,
    });
  });

  it("computeFactEmbeddingFreshness DATABASE_URL yoksa null döner", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const freshness = await computeFactEmbeddingFreshness("aurelia-bay");
    expect(freshness).toBeNull();
  });

  it("embed API hatasında sessizce devam eder (yayın akışını kırmaz)", async () => {
    vi.mocked(getHotelAiProfile).mockResolvedValue({
      aiPersona: "Rehber",
      language: "tr",
      facts: [],
      policies: [],
    });
    vi.mocked(getPublishedHotelContent).mockResolvedValue({
      ...emptyContent,
      specs: { ...emptySpecs, checkInTime: "14:00" },
    });
    embedTextMock.mockResolvedValue(null);

    await expect(syncFactEmbeddings("aurelia-bay")).resolves.toBeUndefined();
    expect(insertMock).not.toHaveBeenCalled();
  });
});

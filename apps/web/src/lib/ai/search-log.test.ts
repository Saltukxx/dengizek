import { describe, expect, it } from "vitest";
import { searchHotels, type SearchIndexHotel } from "@/lib/ai/hotel-search";
import { searchLogPayload, summarizeSearches } from "@/lib/ai/search-log";

const index: SearchIndexHotel[] = [
  { slug: "a", name: "A", city: "Afyon", address: null, imageUrl: null, starRating: null, amenities: ["Sauna"], petsAllowed: null, rooms: [], texts: [], airportKm: null },
];

describe("arama kayıtları", () => {
  it("kayıt: sorgu maskelenir, sonuç sayısı ve anlaşılmayan kelimeler yazılır", () => {
    const query = "0532 123 45 67 deniz manzaralı otel";
    const payload = searchLogPayload(query, searchHotels(query, index));
    expect(payload.query).not.toContain("0532 123 45 67");
    expect(payload.results).toBe(0);
    expect(payload.unknown).toContain("manzaralı");
  });

  it("özet: sonuçsuz aramalar, anlaşılmayan kelimeler, en çok arananlar", () => {
    const at = (d: string) => new Date(`2026-10-${d}T10:00:00Z`);
    const insights = summarizeSearches([
      { payload: { query: "Sauna olan otel", results: 1, unknown: [] }, createdAt: at("20") },
      { payload: { query: "sauna olan otel", results: 1, unknown: [] }, createdAt: at("21") },
      { payload: { query: "Afyon'da sauna", results: 1, unknown: [] }, createdAt: at("19") },
      { payload: { query: "afyonda sauna", results: 1, unknown: [] }, createdAt: at("19") },
      { payload: { query: "Deniz manzaralı otel", results: 0, unknown: ["deniz", "manzarali"] }, createdAt: at("22") },
      { payload: { query: "Golf sahası", results: 0, unknown: ["manzarali"] }, createdAt: at("23") },
      { payload: null, createdAt: at("23") },
    ]);
    expect(insights.total).toBe(6);
    // Kesme işareti farkı aynı arama sayılır.
    expect(insights.top.find((g) => g.query.toLowerCase().includes("afyon"))?.count).toBe(2);
    expect(insights.top[0]).toMatchObject({ query: "sauna olan otel", count: 2 });
    expect(insights.noResults.map((g) => g.query)).toEqual(["Golf sahası", "Deniz manzaralı otel"]);
    expect(insights.unknownWords[0]).toEqual({ word: "manzarali", count: 2 });
  });
});

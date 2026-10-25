import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/llm", () => ({ getChatModel: () => null, CHAT_PROVIDER_OPTIONS: {} }));

import type { SearchIndexHotel } from "@/lib/ai/hotel-search";
import { searchHotelsSmart, type Interpretation, type Interpreter } from "@/lib/ai/search-interpret";

const hotel = (over: Partial<SearchIndexHotel>): SearchIndexHotel => ({
  slug: "x", name: "X", city: null, address: null, imageUrl: null, starRating: null, amenities: [], petsAllowed: null,
  rooms: [], texts: [], airportKm: null, ...over,
});
const INDEX = [
  hotel({ slug: "k", name: "Kids", city: "Afyon", amenities: ["Çocuk Havuzu", "Mini Club", "Aquapark"] }),
  hotel({ slug: "s", name: "Spa", city: "Denizli", amenities: ["Sauna", "Kese"] }),
];

const empty: Interpretation = {
  amenities: [], places: [], concepts: [], pets: false, guests: null, board: null, nearAirport: false, minStars: null, unsupported: [],
};

describe("modelle yorumlama", () => {
  it("kurallar yeterliyse model çağrılmaz", async () => {
    const interpret = vi.fn<Interpreter>();
    const res = await searchHotelsSmart("Afyon'da çocuk havuzu olan otel", INDEX, [], interpret);
    expect(interpret).not.toHaveBeenCalled();
    expect(res.interpretedByModel).toBe(false);
    expect(res.results.map((r) => r.slug)).toEqual(["k"]);
  });

  it("anlaşılmayan cümlede model yorumu filtrelere eklenir; sonuç veriden gelir", async () => {
    const interpret = vi.fn<Interpreter>().mockResolvedValue({ ...empty, concepts: ["cocuk-dostu"], unsupported: ["sakin"] });
    const res = await searchHotelsSmart("ufaklıklarla gidilecek sakin bir yer", INDEX, [], interpret);
    expect(interpret).toHaveBeenCalledWith("ufaklıklarla gidilecek sakin bir yer", ["Afyon", "Denizli"]);
    expect(res.interpretedByModel).toBe(true);
    expect(res.results.map((r) => r.slug)).toEqual(["k"]);
    // Model yorumlayamadığını söylediyse misafire söylenir.
    expect(res.summary).toContain("“sakin”");
  });

  it("modelin önerdiği olanak otelde yoksa otel listelenmez", async () => {
    const interpret = vi.fn<Interpreter>().mockResolvedValue({ ...empty, amenities: ["golf"] });
    const res = await searchHotelsSmart("çim üstünde top sopa oyunu oynanan otel", INDEX, [], interpret);
    expect(res.results).toEqual([]);
  });

  it("model başarısızsa kural sonucu döner", async () => {
    const res = await searchHotelsSmart("sakin bir yer", INDEX, [], async () => null);
    expect(res.interpretedByModel).toBe(false);
    expect(res.summary).toContain("Ne aradığınızı anlayamadım");
  });

  it("kural ve model birlikte: kuralın bulduğu şehir korunur", async () => {
    const interpret = vi.fn<Interpreter>().mockResolvedValue({ ...empty, places: ["Denizli"], amenities: ["sauna"] });
    const res = await searchHotelsSmart("Afyon'da terleme odası olan otel", INDEX, [], interpret);
    expect(res.query.places).toContain("afyon");
    expect(res.results).toEqual([]);
  });
});

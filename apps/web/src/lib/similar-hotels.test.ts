import { describe, expect, it } from "vitest";
import type { BrowseHotelRow } from "@/lib/hotels-repo";
import { pickSimilarHotels } from "./similar-hotels";

function hotel(slug: string, overrides: Partial<BrowseHotelRow> = {}): BrowseHotelRow {
  return {
    slug,
    name: slug,
    city: "Afyonkarahisar",
    country: "Türkiye",
    shortDescription: null,
    longDescription: null,
    imageUrl: null,
    priceLabel: null,
    starRating: 5,
    amenities: [],
    petsAllowed: null,
    seasons: ["termal"],
    minPriceMinor: null,
    reviewAverage: null,
    reviewCount: 0,
    tourId: null,
    ...overrides,
  };
}

describe("pickSimilarHotels", () => {
  it("kendisini dışarıda bırakır; aynı ili, sonra ortak olanakları öne alır", () => {
    const list = [
      hotel("bu", { amenities: ["termal-havuz", "hamam"] }),
      hotel("baska-il", { city: "Denizli", amenities: ["termal-havuz", "hamam"] }),
      hotel("ayni-il-az", { city: "Afyon", amenities: [] }),
      hotel("ayni-il-cok", { amenities: ["termal-havuz", "hamam"] }),
    ];
    expect(pickSimilarHotels(list, "bu").map((h) => h.slug)).toEqual(["ayni-il-cok", "ayni-il-az", "baska-il"]);
  });

  it("en fazla limit kadar döner", () => {
    const list = Array.from({ length: 8 }, (_, i) => hotel(`o${i}`));
    expect(pickSimilarHotels(list, "o0", 3)).toHaveLength(3);
  });
});

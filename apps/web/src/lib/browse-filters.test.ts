import { describe, expect, it } from "vitest";
import type { BrowseHotelRow } from "@/lib/hotels-repo";
import { parseStaySearch } from "@/lib/stay-search";
import { filterBrowseHotels } from "./browse-filters";

const row = (slug: string, over: Partial<BrowseHotelRow> = {}): BrowseHotelRow =>
  ({ slug, name: slug, city: "Afyon", country: "Türkiye", starRating: 4, amenities: [], petsAllowed: null,
    minPriceMinor: null, reviewAverage: null, tourId: null, promotionBadge: null, roomCapacities: [], closedRanges: [], ...over }) as BrowseHotelRow;

const slugs = (rows: BrowseHotelRow[]) => rows.map((r) => r.slug);

describe("filterBrowseHotels", () => {
  const rows = [
    row("a", { starRating: 5, tourId: "t1", minPriceMinor: 900_000, roomCapacities: [{ capacityAdults: 2, capacityChildren: 1 }] }),
    row("b", { starRating: 3, minPriceMinor: 250_000, promotionBadge: "%10", closedRanges: [{ startDate: "2026-12-20", endDate: "2026-12-31" }] }),
    row("c", { starRating: 4, minPriceMinor: 500_000, roomCapacities: [{ capacityAdults: 4, capacityChildren: 2 }], petsAllowed: true }),
  ];

  it("önerilen sıralama video turu olanları öne alır", () => {
    expect(slugs(filterBrowseHotels(rows, {}))).toEqual(["a", "b", "c"]);
    expect(slugs(filterBrowseHotels(rows, { sort: "price-asc" }))).toEqual(["b", "c", "a"]);
  });

  it("yıldız, fiyat aralığı, tur, kampanya, evcil hayvan", () => {
    expect(slugs(filterBrowseHotels(rows, { minStars: 4 }))).toEqual(["a", "c"]);
    expect(slugs(filterBrowseHotels(rows, { priceBand: "mid" }))).toEqual(["c"]);
    expect(slugs(filterBrowseHotels(rows, { tourOnly: true }))).toEqual(["a"]);
    expect(slugs(filterBrowseHotels(rows, { promoOnly: true }))).toEqual(["b"]);
    expect(slugs(filterBrowseHotels(rows, { petsOnly: true }))).toEqual(["c"]);
  });

  it("kişi sayısını almayan ve kapalı döneme düşen oteller elenir", () => {
    const stay = parseStaySearch(new URLSearchParams("giris=2026-12-24&cikis=2026-12-27&yetiskin=3"));
    // a: en fazla 2 yetişkin · b: kapalı dönem · c: 4 yetişkin alır
    expect(slugs(filterBrowseHotels(rows, { stay }))).toEqual(["c"]);
  });
});

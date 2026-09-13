import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowseHotelRow } from "@/lib/hotels-repo";

const mocks = vi.hoisted(() => ({
  getPublishedHotelsForBrowse: vi.fn(),
  hotelCard: vi.fn(),
  viewTracker: vi.fn(),
}));

vi.mock("@/lib/hotels-repo", () => ({
  getPublishedHotelsForBrowse: mocks.getPublishedHotelsForBrowse,
}));
vi.mock("@/components/guest/analytics-tracker", () => ({
  ViewTracker: (props: Record<string, unknown>) => {
    mocks.viewTracker(props);
    return null;
  },
}));
vi.mock("@/components/marketing", () => ({
  HotelCard: (props: { hotel: { slug: string; name: string }; href?: string; actionLabel?: string }) => {
    mocks.hotelCard(props);
    return <a data-testid="hotel-card" data-slug={props.hotel.slug} href={props.href}>{props.hotel.name}</a>;
  },
  EmptyState: ({ title, description, action }: {
    title: string;
    description: string;
    action: React.ReactNode;
  }) => <section><h2>{title}</h2><p>{description}</p>{action}</section>,
}));

import { HotelBrowse } from "./hotel-browse";

function hotel(overrides: Partial<BrowseHotelRow> & Pick<BrowseHotelRow, "slug" | "name">): BrowseHotelRow {
  const { slug, name, ...rest } = overrides;
  return {
    slug,
    name,
    city: "Bursa",
    country: "Türkiye",
    shortDescription: "Kış oteli",
    longDescription: "",
    imageUrl: "https://cdn.test/hotel.jpg",
    priceLabel: null,
    starRating: 5,
    amenities: ["spa-merkezi"],
    petsAllowed: true,
    seasons: ["kis"],
    minPriceMinor: 900_000,
    reviewAverage: 4.5,
    reviewCount: 10,
    ...rest,
  };
}

const defaultProps = {
  basePath: "/kis/oteller",
  searchParams: {},
  heading: "Kış tatili otelleri",
  featuredAmenities: [
    { key: "spa-merkezi", label: "Spa & Wellness" },
    { key: "kapali-havuz", label: "Kapalı havuz" },
  ],
  season: "kis",
  analyticsPage: "kis-browse",
};

describe("HotelBrowse davranışı", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("arama ve bütün filtreleri birlikte uygular; yalnız eşleşeni kış detayına bağlar", async () => {
    mocks.getPublishedHotelsForBrowse.mockResolvedValue([
      hotel({ slug: "uygun", name: "Uludağ Kar Oteli", minPriceMinor: 850_000 }),
      hotel({ slug: "dusuk-yildiz", name: "Uludağ Ekonomik", starRating: 3 }),
      hotel({ slug: "yanlis-sehir", name: "Erciyes Kar Oteli", city: "Kayseri" }),
      hotel({ slug: "evcil-yok", name: "Uludağ Sessiz", petsAllowed: false }),
      hotel({ slug: "spa-yok", name: "Uludağ Dağ", amenities: ["sauna"] }),
      hotel({ slug: "ucuz", name: "Uludağ Ucuz", minPriceMinor: 250_000 }),
    ]);

    render(await HotelBrowse({
      ...defaultProps,
      searchParams: {
        q: "  ULUDAĞ ",
        stars: "5",
        amenity: "spa-merkezi",
        pets: "1",
        price: "luxury",
      },
    }));

    expect(mocks.getPublishedHotelsForBrowse).toHaveBeenCalledWith({ q: "uludağ", season: "kis" });
    expect(screen.getAllByTestId("hotel-card")).toHaveLength(1);
    expect(screen.getByTestId("hotel-card")).toHaveAttribute("data-slug", "uygun");
    expect(screen.getByTestId("hotel-card")).toHaveAttribute("href", "/kis/oteller/uygun");
    expect(screen.getByText("1 tesis bulundu")).toBeInTheDocument();
    expect(mocks.viewTracker).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "page_view",
      payload: expect.objectContaining({
        page: "kis-browse",
        season: "kis",
        q: "uludağ",
        resultCount: 1,
      }),
    }));
  });

  it("fiyat sıralamasında fiyatı olmayan tesisleri sona bırakır", async () => {
    mocks.getPublishedHotelsForBrowse.mockResolvedValue([
      hotel({ slug: "fiyatsiz", name: "Fiyatsız", minPriceMinor: null }),
      hotel({ slug: "pahali", name: "Pahalı", minPriceMinor: 1_200_000 }),
      hotel({ slug: "ucuz", name: "Ucuz", minPriceMinor: 400_000 }),
    ]);

    render(await HotelBrowse({
      ...defaultProps,
      searchParams: { sort: "price-asc" },
    }));

    expect(screen.getAllByTestId("hotel-card").map((card) => card.dataset.slug)).toEqual([
      "ucuz",
      "pahali",
      "fiyatsiz",
    ]);
  });

  it("filtre bağlantıları mevcut koşulları korur ve sayfayı 1'e sıfırlar", async () => {
    mocks.getPublishedHotelsForBrowse.mockResolvedValue([hotel({ slug: "uygun", name: "Uygun" })]);

    render(await HotelBrowse({
      ...defaultProps,
      searchParams: { q: "Bursa", stars: "5", amenity: "spa-merkezi", sayfa: "4" },
    }));

    const sortLink = screen.getByRole("link", { name: "En düşük fiyat" });
    expect(sortLink).toHaveAttribute(
      "href",
      "/kis/oteller?q=Bursa&stars=5&amenity=spa-merkezi&sort=price-asc",
    );
    expect(sortLink.getAttribute("href")).not.toContain("sayfa=");
    expect(screen.getByRole("link", { name: "Filtreleri temizle" })).toHaveAttribute(
      "href",
      "/kis/oteller",
    );
  });

  it("sonuç yoksa kart yerine erişilebilir boş durum ve temizleme eylemi gösterir", async () => {
    mocks.getPublishedHotelsForBrowse.mockResolvedValue([]);

    render(await HotelBrowse({ ...defaultProps, searchParams: { q: "olmayan" } }));

    expect(screen.queryByTestId("hotel-card")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Eşleşen otel yok" })).toBeInTheDocument();
    expect(screen.getByText("Aramayı genişletin veya filtreleri temizleyin.")).toBeInTheDocument();
  });

  it("sayfalamayı filtrelerden sonra yapar ve taşan sayfayı son sayfaya kelepçeler", async () => {
    mocks.getPublishedHotelsForBrowse.mockResolvedValue(
      Array.from({ length: 13 }, (_, index) => hotel({
        slug: `otel-${index + 1}`,
        name: `Otel ${index + 1}`,
      })),
    );

    render(await HotelBrowse({ ...defaultProps, searchParams: { sayfa: "99", stars: "5" } }));

    expect(screen.getAllByTestId("hotel-card")).toHaveLength(1);
    expect(screen.getByTestId("hotel-card")).toHaveAttribute("data-slug", "otel-13");
    expect(screen.getByText("13 tesis bulundu · sayfa 2/2")).toBeInTheDocument();
    const pagination = screen.getByRole("navigation", { name: "Sayfalama" });
    const previousUrl = new URL(
      within(pagination).getByRole("link", { name: "Önceki sayfa" }).getAttribute("href")!,
      "http://localhost",
    );
    expect(previousUrl.pathname).toBe("/kis/oteller");
    expect(Object.fromEntries(previousUrl.searchParams)).toEqual({ sayfa: "1", stars: "5" });
    expect(within(pagination).getByRole("link", { name: "Sonraki sayfa" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

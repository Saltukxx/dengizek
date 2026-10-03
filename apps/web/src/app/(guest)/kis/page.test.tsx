import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPublishedHotelsForBrowse: vi.fn() }));

vi.mock("@/lib/hotels-repo", () => ({
  getPublishedHotelsForBrowse: mocks.getPublishedHotelsForBrowse,
}));
vi.mock("@/components/guest/analytics-tracker", () => ({ ViewTracker: () => null }));
vi.mock("@/components/marketing", () => ({
  HotelCard: ({ hotel, href, actionLabel }: {
    hotel: { name: string };
    href: string;
    actionLabel: string;
  }) => <a href={href}>{hotel.name} — {actionLabel}</a>,
}));

import WinterHomePage from "./page";

const winterHotel = {
  slug: "kar-zirvesi",
  name: "Kar Zirvesi",
  city: "Bursa",
  country: "Türkiye",
  shortDescription: "Pist yanında",
  longDescription: "",
  imageUrl: "https://cdn.test/winter.jpg",
  priceLabel: "12.500 ₺",
  reviewAverage: 4.8,
  reviewCount: 24,
  starRating: 5,
  amenities: ["spa-merkezi"],
  minPriceMinor: 1_250_000,
};

describe("kış ana sayfası", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPublishedHotelsForBrowse.mockResolvedValue([winterHotel]);
  });

  it("repo sorgusunu yalnızca kış sezonuyla yapar ve kartı kış detayına bağlar", async () => {
    render(await WinterHomePage());

    expect(mocks.getPublishedHotelsForBrowse).toHaveBeenCalledOnce();
    expect(mocks.getPublishedHotelsForBrowse).toHaveBeenCalledWith({ season: "kis" });
    expect(screen.getByRole("link", { name: /Kar Zirvesi — Tesisi İncele/ })).toHaveAttribute(
      "href",
      "/kis/oteller/kar-zirvesi",
    );
    expect(screen.getByRole("button", { name: "Kış Otellerini Bul" }).closest("form"))
      .toHaveAttribute("action", "/kis/oteller");
    expect(screen.getByRole("img", { name: "Pistte kayakçı" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Kar manzaralı lobide video tur durakları" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Video tur örneğini incele" })).toHaveAttribute(
      "href",
      "/kis/oteller",
    );
    expect(screen.getByRole("link", { name: /Turu Başlat/ })).toHaveAttribute(
      "href",
      "/kis/oteller",
    );
  });

  it("kış tesisi yokken yaz/legacy tesisi göstermeyip açıklayıcı boş durum sunar", async () => {
    mocks.getPublishedHotelsForBrowse.mockResolvedValue([]);

    render(await WinterHomePage());

    expect(screen.queryByText(/Tesisi İncele/)).not.toBeInTheDocument();
    expect(screen.getByText(/Kış sezonu için henüz yayında tesis yok/)).toBeInTheDocument();
  });
});

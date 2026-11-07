import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SHOWCASE_CONFIGS } from "@/lib/marketing/showcase-config";

const showcaseMocks = vi.hoisted(() => ({
  getPublishedHotelsForBrowse: vi.fn(),
  getPublishedHotelContent: vi.fn(),
  getShowcaseDemoDialog: vi.fn(),
  scene: vi.fn(),
  tryChat: vi.fn(),
}));

vi.mock("@/lib/hotels-repo", () => ({
  getPublishedHotelsForBrowse: showcaseMocks.getPublishedHotelsForBrowse,
  getPublishedHotelContent: showcaseMocks.getPublishedHotelContent,
}));
vi.mock("@/lib/marketing/showcase-demo", () => ({ getShowcaseDemoDialog: showcaseMocks.getShowcaseDemoDialog }));
vi.mock("@/components/guest/analytics-tracker", () => ({ ViewTracker: () => null }));
vi.mock("@/components/guest/owner-band", () => ({ OwnerBand: () => <div data-testid="owner-band" /> }));
vi.mock("@/components/guest/assistant-search-box", () => ({ AssistantSearchBox: () => <div data-testid="assistant" /> }));
vi.mock("@/components/marketing", () => ({
  HotelCard: ({ hotel, href }: { hotel: { name: string; slug: string }; href?: string }) => (
    <a href={href ?? `/hotels/${hotel.slug}`}>{hotel.name}</a>
  ),
}));
vi.mock("@/components/marketing/showcase/hero-scene", () => ({
  ShowcaseHeroScene: (props: unknown) => {
    showcaseMocks.scene(props);
    return <div data-testid="scene" />;
  },
}));
vi.mock("@/components/marketing/showcase/try-chat", () => ({
  ShowcaseTryChat: (props: unknown) => {
    showcaseMocks.tryChat(props);
    return <div data-testid="try-chat" />;
  },
}));

function hotel(slug: string, name: string, city: string, tourId: string | null = null) {
  return {
    slug,
    name,
    city,
    country: "Türkiye",
    shortDescription: "",
    longDescription: "",
    imageUrl: `/uploads/${slug}.jpg`,
    priceLabel: null,
    reviewAverage: null,
    reviewCount: 0,
    starRating: 5,
    amenities: ["spa-merkezi"],
    minPriceMinor: null,
    tourId,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  showcaseMocks.getPublishedHotelContent.mockResolvedValue({
    rooms: [],
    restaurants: [],
    amenities: [],
    specs: { checkInTime: "14:00", checkOutTime: null, cancellationPolicy: null, childPolicy: null, petsAllowed: null, airportDistanceKm: null },
  });
});

import WinterHomePage from "./page";

const dialog = {
  hotelSlug: "erciyes-kar-evi",
  hotelName: "Erciyes Kar Evi",
  question: "Gondol istasyonu ne kadar uzak?",
  answer: "Gondol istasyonuna yürüme mesafesi.",
  cardLabel: "Otel ifadesi",
};

describe("kış ana sayfası", () => {
  beforeEach(() => {
    showcaseMocks.getPublishedHotelsForBrowse.mockResolvedValue([hotel("kar-zirvesi", "Kar Zirvesi", "Bursa", "kis-turu")]);
    showcaseMocks.getShowcaseDemoDialog.mockResolvedValue(dialog);
  });

  it("repo sorgusunu yalnızca kış sezonuyla yapar ve kartı kış detayına bağlar", async () => {
    render(await WinterHomePage());

    expect(showcaseMocks.getPublishedHotelsForBrowse).toHaveBeenCalledOnce();
    expect(showcaseMocks.getPublishedHotelsForBrowse).toHaveBeenCalledWith({ season: "kis" });
    expect(showcaseMocks.getShowcaseDemoDialog).toHaveBeenCalledWith("kis", expect.any(Array));
    expect(screen.getByRole("link", { name: "Kar Zirvesi" })).toHaveAttribute("href", "/kis/oteller/kar-zirvesi");
    expect(screen.getByRole("button", { name: /Kış Otellerini Bul/ }).closest("form")).toHaveAttribute(
      "action",
      "/kis/oteller",
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Kışı, gitmeden önce yaşayın.");
  });

  it("banner sahnesi kış senaryosu (gondol → şömineli oda → pist) ile oynar", async () => {
    render(await WinterHomePage());

    expect(showcaseMocks.scene).toHaveBeenCalledWith(
      expect.objectContaining({ script: SHOWCASE_CONFIGS.kis.script }),
    );
    expect(SHOWCASE_CONFIGS.kis.script.stops.map((s) => s.label)).toEqual(["Gondol", "Şömineli oda", "Pist"]);
    expect(showcaseMocks.tryChat.mock.calls[0]![0]).toMatchObject({
      inquiryPath: "/kis/talep",
      hotelHref: "/kis/oteller/erciyes-kar-evi",
    });
  });

  it("kış tesisi yokken yaz/legacy tesisi göstermeyip açıklayıcı boş durum sunar", async () => {
    showcaseMocks.getPublishedHotelsForBrowse.mockResolvedValue([]);
    showcaseMocks.getShowcaseDemoDialog.mockResolvedValue(null);

    render(await WinterHomePage());

    expect(screen.queryByRole("link", { name: "Kar Zirvesi" })).not.toBeInTheDocument();
    expect(screen.getByText(/Kış sezonu için henüz yayında tesis yok/)).toBeInTheDocument();
    expect(screen.queryByTestId("scene")).not.toBeInTheDocument();
  });
});

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

import HomePage from "./page";

const dialog = {
  hotelSlug: "aurelia-bay",
  hotelName: "Aurelia Bay Otel",
  question: "Restoran kaçta açık?",
  answer: "Restoran Aurelia Teras, saatler: 07:00 - 23:00.",
  cardLabel: "Doğrulanmış bilgi",
};

describe("yaz ana sayfası", () => {
  beforeEach(() => {
    showcaseMocks.getPublishedHotelsForBrowse.mockResolvedValue([hotel("aurelia-bay", "Aurelia Bay Otel", "Dubrovnik", "demo-lobby")]);
    showcaseMocks.getShowcaseDemoDialog.mockResolvedValue(dialog);
  });

  it("yaz sezonunu sorgular; banner'da yapay zekâ araması ve yaz senaryosu", async () => {
    render(await HomePage());

    expect(showcaseMocks.getPublishedHotelsForBrowse).toHaveBeenCalledWith({ season: "yaz" });
    expect(showcaseMocks.getShowcaseDemoDialog).toHaveBeenCalledWith("yaz", expect.any(Array));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Otele gitmeden önce içini gezin.");
    expect(screen.getByTestId("assistant")).toBeInTheDocument();
    expect(showcaseMocks.scene).toHaveBeenCalledWith(expect.objectContaining({ script: SHOWCASE_CONFIGS.yaz.script }));
    expect(showcaseMocks.tryChat.mock.calls[0]![0]).toMatchObject({
      inquiryPath: "/inquiry",
      hotelHref: "/hotels/aurelia-bay",
    });
  });

  it("5 otelden az yayındayken rakam şeridini göstermez", async () => {
    render(await HomePage());

    expect(screen.queryByText("otel yayında")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Aurelia Bay Otel" })).toHaveAttribute("href", "/hotels/aurelia-bay");
  });
});

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

import ThermalHomePage from "./page";

const dialog = {
  hotelSlug: "ikbal-termal-hotel",
  hotelName: "İkbal Termal",
  question: "Termal havuz kaç derece?",
  answer: "Havuzlarımız 38 derece.",
  cardLabel: "Otel ifadesi",
};

describe("termal ana sayfası", () => {
  beforeEach(() => {
    showcaseMocks.getPublishedHotelsForBrowse.mockResolvedValue([
      hotel("akrones-termal-hotel", "Akrones Termal", "Afyonkarahisar"),
      hotel("ikbal-termal-hotel", "İkbal Termal", "Afyon", "tur-1"),
      hotel("pamukkale-termal", "Pamukkale Termal", "Denizli"),
      hotel("yalova-termal", "Yalova Termal", "Yalova"),
      hotel("bursa-termal", "Bursa Termal", "Bursa"),
    ]);
    showcaseMocks.getShowcaseDemoDialog.mockResolvedValue(dialog);
  });

  it("yalnızca termal sezonunu sorgular, kartları termal detayına bağlar", async () => {
    render(await ThermalHomePage());

    expect(showcaseMocks.getPublishedHotelsForBrowse).toHaveBeenCalledWith({ season: "termal" });
    expect(showcaseMocks.getShowcaseDemoDialog).toHaveBeenCalledWith("termal", expect.any(Array));
    expect(screen.getByRole("link", { name: "Akrones Termal" })).toHaveAttribute(
      "href",
      "/termal/oteller/akrones-termal-hotel",
    );
    expect(screen.getByRole("button", { name: /Termal Otelleri Bul/ }).closest("form")).toHaveAttribute(
      "action",
      "/termal/oteller",
    );
  });

  it("banner sahnesi termal senaryosu ve gerçek otel bilgisiyle oynar", async () => {
    render(await ThermalHomePage());

    expect(showcaseMocks.scene).toHaveBeenCalledWith({
      dialog: { question: dialog.question, answer: dialog.answer, cardLabel: dialog.cardLabel, hotelName: dialog.hotelName },
      script: SHOWCASE_CONFIGS.termal.script,
    });
    const tryProps = showcaseMocks.tryChat.mock.calls[0]![0] as Record<string, unknown>;
    expect(tryProps).toMatchObject({
      hotelSlug: "ikbal-termal-hotel",
      inquiryPath: "/termal/talep",
      hotelHref: "/termal/oteller/ikbal-termal-hotel",
    });
    expect((tryProps.starterQuestions as string[])[0]).toBe(dialog.question);
  });

  it("rakamlar veriden hesaplanır; Afyon ve Afyonkarahisar tek bölge", async () => {
    render(await ThermalHomePage());

    expect(screen.getByText("termal otel yayında").previousSibling).toHaveTextContent("5");
    expect(screen.getByText("ilde kaplıca bölgesi").previousSibling).toHaveTextContent("4");
    const afyon = screen.getByRole("link", { name: /Afyonkarahisar/ });
    expect(afyon).toHaveAttribute("href", "/termal/oteller?q=Afyon");
    expect(afyon).toHaveTextContent("2 otel");
  });

  it("uygun gerçek bilgi yoksa sahne ve canlı demo gösterilmez", async () => {
    showcaseMocks.getShowcaseDemoDialog.mockResolvedValue(null);

    render(await ThermalHomePage());

    expect(screen.queryByTestId("scene")).not.toBeInTheDocument();
    expect(screen.queryByTestId("try-chat")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Diğer siteler fotoğraf gösterir/ })).toBeInTheDocument();
  });

  it("termal tesis yokken açıklayıcı boş durum sunar", async () => {
    showcaseMocks.getPublishedHotelsForBrowse.mockResolvedValue([]);
    showcaseMocks.getShowcaseDemoDialog.mockResolvedValue(null);

    render(await ThermalHomePage());

    expect(screen.getByText(/Termal sezon için henüz yayında tesis yok/)).toBeInTheDocument();
    expect(screen.queryByText("Termal bölgeler")).not.toBeInTheDocument();
    expect(screen.queryByText("termal otel yayında")).not.toBeInTheDocument();
  });
});

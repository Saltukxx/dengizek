import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublishedHotelBySlug: vi.fn(),
  getPublishedHotelContent: vi.fn(),
  getPublishedReviews: vi.fn(),
  getPublishedTours: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/hotels-repo", async () => {
  const actual = await vi.importActual<typeof import("@/lib/hotels-repo")>("@/lib/hotels-repo");
  return {
    ...actual,
    getPublishedHotelBySlug: mocks.getPublishedHotelBySlug,
    getPublishedHotelContent: mocks.getPublishedHotelContent,
    getPublishedReviews: mocks.getPublishedReviews,
    getPublishedTours: mocks.getPublishedTours,
  };
});
vi.mock("@/components/guest/analytics-tracker", () => ({ ViewTracker: () => null }));
vi.mock("@/components/guest/amenities-section", () => ({ AmenitiesSection: () => null }));
vi.mock("@/components/guest/availability-section", () => ({ AvailabilitySection: () => null }));
vi.mock("@/components/guest/extras-section", () => ({ ExtrasSection: () => null }));
vi.mock("@/components/guest/gallery-section", () => ({ GallerySection: () => null }));
vi.mock("@/components/guest/hotel-map-section", () => ({ HotelMapSection: () => null }));
vi.mock("@/components/guest/policies-section", () => ({ PoliciesSection: () => null }));
vi.mock("@/components/guest/restaurants-section", () => ({ RestaurantsSection: () => null }));
vi.mock("@/components/guest/rooms-section", () => ({ RoomsSection: () => null }));
vi.mock("@/components/guest/reviews-section", () => ({ ReviewsSection: () => null }));

import { generateHotelMetadata, HotelDetailPage } from "./page";

const hotel = {
  slug: "kar-zirvesi",
  name: "Kar Zirvesi",
  city: "Bursa",
  country: "Türkiye",
  shortDescription: "Pist yanında",
  longDescription: "Kış deneyimi",
  imageUrl: "https://cdn.test/kar.jpg",
  roomTypes: [],
};

function content(seasons: string[]) {
  return {
    specs: {
      starRating: 5,
      totalRooms: 40,
      checkInTime: "14:00",
      checkOutTime: "11:00",
      cancellationPolicy: null,
      childPolicy: null,
      petsAllowed: false,
      seasons,
      paymentMethods: [],
      address: "Uludağ, Bursa",
      phone: null,
      contactEmail: null,
      airportDistanceKm: null,
      blackoutText: null,
    },
    rooms: [],
    restaurants: [],
    extras: [],
    amenities: [],
    gallery: [],
    promotions: [],
    ratePlanPrices: [],
    availabilityNotes: [],
    latitude: null,
    longitude: null,
  };
}

describe("otel detay sezon koruması", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPublishedHotelBySlug.mockResolvedValue(hotel);
    mocks.getPublishedHotelContent.mockResolvedValue(content(["kis"]));
    mocks.getPublishedReviews.mockResolvedValue({ average: null, count: 0, reviews: [] });
    mocks.getPublishedTours.mockResolvedValue([
      { tourId: "genel-tur", title: "Genel Tur", roomSlug: null },
    ]);
  });

  afterEach(() => cleanup());

  it("sezonu boş eski tesisi kış detayında 404 yapar", async () => {
    mocks.getPublishedHotelContent.mockResolvedValue(content([]));

    await expect(
      HotelDetailPage({ params: Promise.resolve({ slug: "kar-zirvesi" }), surface: "kis" }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mocks.notFound).toHaveBeenCalledOnce();
  });

  it("sezonu boş eski tesisi yaz detayından düşürmez", async () => {
    mocks.getPublishedHotelContent.mockResolvedValue(content([]));

    render(await HotelDetailPage({ params: Promise.resolve({ slug: "kar-zirvesi" }) }));

    expect(screen.getByRole("heading", { name: "Kar Zirvesi" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Oteller" })).toHaveAttribute("href", "/browse");
    expect(screen.getByRole("link", { name: "Sanal Turu Başlat" })).toHaveAttribute(
      "href",
      "/tours/kar-zirvesi/genel-tur",
    );
  });

  it("kış tesisinin navigasyon ve tur bağlantılarını kış bağlamında tutar", async () => {
    render(await HotelDetailPage({
      params: Promise.resolve({ slug: "kar-zirvesi" }),
      surface: "kis",
    }));

    expect(screen.getByRole("link", { name: "Oteller" })).toHaveAttribute("href", "/kis/oteller");
    expect(screen.getByRole("link", { name: "Sanal Turu Başlat" })).toHaveAttribute(
      "href",
      "/tours/kar-zirvesi/genel-tur?surface=kis",
    );
  });

  it("kış metadata'sında da sezonu boş tesisi yayınlamaz", async () => {
    mocks.getPublishedHotelContent.mockResolvedValue(content([]));

    await expect(generateHotelMetadata(
      { params: Promise.resolve({ slug: "kar-zirvesi" }) },
      "kis",
    )).resolves.toEqual({ title: "Otel" });
  });
});

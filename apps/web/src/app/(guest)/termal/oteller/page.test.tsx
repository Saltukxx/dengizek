import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ hotelBrowse: vi.fn() }));

vi.mock("@/components/guest/hotel-browse", () => ({
  HotelBrowse: (props: Record<string, unknown>) => {
    mocks.hotelBrowse(props);
    return <div data-testid="thermal-browse" />;
  },
}));

import ThermalBrowsePage from "./page";

describe("termal otel listesi route bağlantısı", () => {
  beforeEach(() => vi.clearAllMocks());

  it("arama parametrelerini koruyup listeyi termal sezonuna sabitler", async () => {
    const searchParams = { q: "afyon", stars: "5", price: "luxury" };

    render(await ThermalBrowsePage({ searchParams: Promise.resolve(searchParams) }));

    expect(screen.getByTestId("thermal-browse")).toBeInTheDocument();
    expect(mocks.hotelBrowse).toHaveBeenCalledWith(
      expect.objectContaining({
        basePath: "/termal/oteller",
        searchParams,
        heading: "Termal oteller",
        season: "termal",
        analyticsPage: "termal-browse",
        featuredAmenities: expect.arrayContaining([
          expect.objectContaining({ key: "termal-havuz" }),
          expect.objectContaining({ key: "kapali-havuz" }),
        ]),
      }),
    );
  });
});

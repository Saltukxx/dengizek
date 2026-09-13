import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ hotelBrowse: vi.fn() }));

vi.mock("@/components/guest/hotel-browse", () => ({
  HotelBrowse: (props: Record<string, unknown>) => {
    mocks.hotelBrowse(props);
    return <div data-testid="winter-browse" />;
  },
}));

import WinterBrowsePage from "./page";

describe("kış otel listesi route bağlantısı", () => {
  beforeEach(() => vi.clearAllMocks());

  it("arama parametrelerini koruyup listeyi kış sezonuna sabitler", async () => {
    const searchParams = { q: "uludağ", stars: "5", price: "luxury" };

    render(await WinterBrowsePage({ searchParams: Promise.resolve(searchParams) }));

    expect(screen.getByTestId("winter-browse")).toBeInTheDocument();
    expect(mocks.hotelBrowse).toHaveBeenCalledWith(
      expect.objectContaining({
        basePath: "/kis/oteller",
        searchParams,
        heading: "Kış tatili otelleri",
        season: "kis",
        analyticsPage: "kis-browse",
        featuredAmenities: expect.arrayContaining([
          expect.objectContaining({ key: "spa-merkezi" }),
          expect.objectContaining({ key: "kapali-havuz" }),
        ]),
      }),
    );
  });
});

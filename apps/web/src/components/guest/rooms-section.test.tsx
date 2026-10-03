import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RoomsSection } from "./rooms-section";
import type { RoomWithRates } from "@/lib/hotels-repo";

const room = {
  id: "r1",
  slug: "deluxe",
  name: "Deluxe",
  tagline: null,
  description: null,
  imageUrl: null,
  sizeSqm: 32,
  capacityAdults: 2,
  capacityChildren: 0,
  bedConfig: null,
  viewType: null,
  amenities: [],
  boardType: "sadece-oda",
  priceMinor: 500000,
  currency: "TRY",
  priceOnRequest: false,
  discountPercent: null,
  discountLabel: null,
  minStayNights: null,
  pricingNotes: null,
  rates: [],
} as unknown as RoomWithRates;

describe("RoomsSection yüzey bağlantıları", () => {
  it("yaz yüzeyinde oda detayına /hotels üzerinden gider", () => {
    render(<RoomsSection hotelSlug="aurelia-bay" rooms={[room]} />);
    expect(screen.getByRole("link", { name: /Deluxe/ })).toHaveAttribute(
      "href",
      "/hotels/aurelia-bay/rooms/deluxe",
    );
  });

  it("kış yüzeyinde oda detayını kış rotasında tutar", () => {
    render(<RoomsSection hotelSlug="aurelia-bay" rooms={[room]} surface="kis" />);
    expect(screen.getByRole("link", { name: /Deluxe/ })).toHaveAttribute(
      "href",
      "/kis/oteller/aurelia-bay/rooms/deluxe",
    );
  });
});

// ---------------------------------------------------------------------------
// Oda için tur seçimi — oda turu varsa o, yoksa tesisin genel turu.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { pickTourForRoom, type PublishedTourSummary } from "@/lib/hotels-repo";

const genel: PublishedTourSummary = { tourId: "genel", title: "Tesis turu", roomSlug: null };
const deniz: PublishedTourSummary = {
  tourId: "deniz-suit",
  title: "Deniz suit",
  roomSlug: "seaview-deluxe",
};
const avlu: PublishedTourSummary = {
  tourId: "avlu",
  title: "Avlu",
  roomSlug: "courtyard-quiet",
};

describe("pickTourForRoom", () => {
  it("odaya ait turu tercih eder", () => {
    expect(pickTourForRoom([genel, deniz, avlu], "seaview-deluxe")).toBe(deniz);
  });

  it("oda turu yoksa genel tura düşer", () => {
    expect(pickTourForRoom([genel, avlu], "seaview-deluxe")).toBe(genel);
  });

  it("hiç tur yoksa undefined döner", () => {
    expect(pickTourForRoom([], "seaview-deluxe")).toBeUndefined();
  });

  it("yalnızca başka odanın turu varsa undefined döner (yanlış oda gösterilmez)", () => {
    expect(pickTourForRoom([avlu], "seaview-deluxe")).toBeUndefined();
  });
});

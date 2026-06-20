import { describe, expect, it } from "vitest";
import type { TourCallout } from "@/lib/schemas/tour-manifest";
import { getActiveCallout, getVisibleCallouts } from "./tour-active-callout";

describe("getActiveCallout", () => {
  const c: TourCallout[] = [
    { id: "1", tSec: 0, title: "A" },
    { id: "2", tSec: 2, title: "B" },
  ];

  it("en son uygun callout", () => {
    expect(getActiveCallout(c, 0.5)?.id).toBe("1");
    expect(getActiveCallout(c, 2.2)?.id).toBe("2");
  });

  it("yok", () => {
    expect(getActiveCallout(undefined, 1)).toBeNull();
  });
});

describe("getVisibleCallouts", () => {
  const c: TourCallout[] = [
    { id: "1", tSec: 0, title: "A" },
    { id: "2", tSec: 2, title: "B" },
  ];

  it("tSec geçen hepsi, sıra korunur", () => {
    expect(getVisibleCallouts(c, 0.5).map((x) => x.id)).toEqual(["1"]);
    expect(getVisibleCallouts(c, 2.2).map((x) => x.id)).toEqual(["1", "2"]);
  });

  it("boş", () => {
    expect(getVisibleCallouts(undefined, 1)).toEqual([]);
  });
});

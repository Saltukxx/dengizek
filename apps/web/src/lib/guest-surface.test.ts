import { describe, expect, it } from "vitest";
import { guestPaths, guestSurfaceFromPath } from "./guest-surface";

describe("guestSurfaceFromPath", () => {
  it("kış önekini kış yüzeyi olarak okur", () => {
    expect(guestSurfaceFromPath("/kis")).toBe("kis");
    expect(guestSurfaceFromPath("/kis/oteller/aurelia-bay")).toBe("kis");
  });

  it("diğer yolları yaz yüzeyi olarak okur", () => {
    expect(guestSurfaceFromPath("/")).toBe("yaz");
    expect(guestSurfaceFromPath("/browse")).toBe("yaz");
    expect(guestSurfaceFromPath("/hotels/aurelia-bay")).toBe("yaz");
    expect(guestSurfaceFromPath(null)).toBe("yaz");
  });
});

describe("guestPaths", () => {
  it("yaz yüzeyinde yaz rotalarını üretir", () => {
    const paths = guestPaths("yaz");
    expect(paths.inquiry).toBe("/inquiry");
    expect(paths.hotel("aurelia-bay")).toBe("/hotels/aurelia-bay");
    expect(paths.room("aurelia-bay", "deluxe")).toBe("/hotels/aurelia-bay/rooms/deluxe");
    expect(paths.tour("aurelia-bay", "demo-lobby")).toBe("/tours/aurelia-bay/demo-lobby");
  });

  it("kış yüzeyinde kış rotalarını üretir", () => {
    const paths = guestPaths("kis");
    expect(paths.home).toBe("/kis");
    expect(paths.browse).toBe("/kis/oteller");
    expect(paths.inquiry).toBe("/kis/talep");
    expect(paths.hotel("aurelia-bay")).toBe("/kis/oteller/aurelia-bay");
    expect(paths.room("aurelia-bay", "deluxe")).toBe("/kis/oteller/aurelia-bay/rooms/deluxe");
    expect(paths.tour("aurelia-bay", "demo-lobby", "deluxe")).toBe(
      "/tours/aurelia-bay/demo-lobby?surface=kis&room=deluxe",
    );
  });
});

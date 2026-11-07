import { describe, expect, it } from "vitest";
import { guestPaths, guestSurfaceFromPath, hotelPathFor } from "./guest-surface";

describe("guestSurfaceFromPath", () => {
  it("kış önekini kış yüzeyi olarak okur", () => {
    expect(guestSurfaceFromPath("/kis")).toBe("kis");
    expect(guestSurfaceFromPath("/kis/oteller/aurelia-bay")).toBe("kis");
  });

  it("termal önekini termal yüzeyi olarak okur", () => {
    expect(guestSurfaceFromPath("/termal")).toBe("termal");
    expect(guestSurfaceFromPath("/termal/oteller/akrones-termal-hotel")).toBe("termal");
    expect(guestSurfaceFromPath("/termal/talep")).toBe("termal");
  });

  it("öneki yalnızca tam yol parçası olarak eşler", () => {
    expect(guestSurfaceFromPath("/kisisel")).toBe("yaz");
    expect(guestSurfaceFromPath("/termalx")).toBe("yaz");
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

  it("termal yüzeyinde termal rotalarını üretir", () => {
    const paths = guestPaths("termal");
    expect(paths.home).toBe("/termal");
    expect(paths.browse).toBe("/termal/oteller");
    expect(paths.inquiry).toBe("/termal/talep");
    expect(paths.inquirySuccess).toBe("/termal/talep/basarili");
    expect(paths.hotel("akrones")).toBe("/termal/oteller/akrones");
    expect(paths.room("akrones", "suit")).toBe("/termal/oteller/akrones/rooms/suit");
    expect(paths.tour("akrones", "t1")).toBe("/tours/akrones/t1?surface=termal");
  });

  it("talep başarı rotası her yüzeyde kendi önekini taşır", () => {
    expect(guestPaths("yaz").inquirySuccess).toBe("/inquiry/success");
    expect(guestPaths("kis").inquirySuccess).toBe("/kis/talep/basarili");
  });
});

describe("hotelPathFor", () => {
  it("bulunulan vitrine ait otel orada açılır", () => {
    expect(hotelPathFor("akrones", ["termal"], "termal")).toBe("/termal/oteller/akrones");
    expect(hotelPathFor("kar", ["kis"], "kis")).toBe("/kis/oteller/kar");
  });

  it("başka vitrinin oteli kendi vitrininde açılır", () => {
    expect(hotelPathFor("akrones", ["termal"], "yaz")).toBe("/termal/oteller/akrones");
    expect(hotelPathFor("kar", ["kis"], "termal")).toBe("/kis/oteller/kar");
  });

  it("sezonsuz ya da yazlık otel yaz sayfasında açılır", () => {
    expect(hotelPathFor("aurelia", [], "termal")).toBe("/hotels/aurelia");
    expect(hotelPathFor("aurelia", ["yaz"], "kis")).toBe("/hotels/aurelia");
    expect(hotelPathFor("x", undefined, "yaz")).toBe("/hotels/x");
  });

  it("arama sayfası her vitrinde kendi önekiyle", () => {
    expect(guestPaths("yaz").finder).toBe("/otel-bul");
    expect(guestPaths("termal").finder).toBe("/termal/otel-bul");
    expect(guestPaths("kis").finder).toBe("/kis/otel-bul");
  });
});

import { describe, expect, it } from "vitest";
import { normalizeProvince, topCities } from "./guest-city-groups";

describe("il adları", () => {
  it("kısa yazımı resmî ada çevirir, diğerlerine dokunmaz", () => {
    expect(normalizeProvince("Afyon")).toBe("Afyonkarahisar");
    expect(normalizeProvince(" afyon ")).toBe("Afyonkarahisar");
    expect(normalizeProvince("Afyonkarahisar")).toBe("Afyonkarahisar");
    expect(normalizeProvince("Denizli")).toBe("Denizli");
    expect(normalizeProvince(null)).toBeNull();
  });

  it("şehir listesinde iki yazım tek satırda toplanır", () => {
    const groups = topCities([{ city: "Afyon" }, { city: "Afyonkarahisar" }, { city: "Denizli" }]);
    expect(groups[0]).toEqual({ label: "Afyonkarahisar", query: "Afyon", count: 2 });
  });
});

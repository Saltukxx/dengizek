import { describe, expect, it } from "vitest";
import { nightsFromEvents } from "@/lib/ical/import";

describe("nightsFromEvents", () => {
  it("DTEND'i hariç tutar (çıkış günü kapatılmaz)", () => {
    expect(nightsFromEvents([{ start: "2026-08-01", end: "2026-08-04" }])).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
    ]);
  });

  it("çakışan olaylarda geceleri tekilleştirir", () => {
    expect(
      nightsFromEvents([
        { start: "2026-08-01", end: "2026-08-03" },
        { start: "2026-08-02", end: "2026-08-04" },
      ]),
    ).toEqual(["2026-08-01", "2026-08-02", "2026-08-03"]);
  });

  it("sonucu sıralı döner", () => {
    expect(
      nightsFromEvents([
        { start: "2026-09-10", end: "2026-09-11" },
        { start: "2026-08-01", end: "2026-08-02" },
      ]),
    ).toEqual(["2026-08-01", "2026-09-10"]);
  });

  it("tek gecelik konaklamayı tek gün olarak yazar", () => {
    expect(nightsFromEvents([{ start: "2026-08-01", end: "2026-08-02" }])).toEqual([
      "2026-08-01",
    ]);
  });

  it("olay yoksa boş dizi döner", () => {
    expect(nightsFromEvents([])).toEqual([]);
  });
});

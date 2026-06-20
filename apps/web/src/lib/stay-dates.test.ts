import { describe, expect, it } from "vitest";
import {
  eachStayNight,
  parseStayDate,
  stayRangesOverlap,
  validateLatLng,
  validateStayDates,
} from "./stay-dates";

describe("validateStayDates", () => {
  it("accepts empty dates", () => {
    expect(validateStayDates("", "")).toEqual({ ok: true, checkIn: null, checkOut: null });
  });

  it("rejects partial dates", () => {
    expect(validateStayDates("2026-07-01", "")).toEqual({
      ok: false,
      error: "Giriş ve çıkış tarihleri birlikte girilmelidir.",
    });
  });

  it("rejects checkOut <= checkIn", () => {
    expect(validateStayDates("2026-07-05", "2026-07-05")).toEqual({
      ok: false,
      error: "Çıkış tarihi giriş tarihinden sonra olmalıdır.",
    });
  });

  it("accepts valid range", () => {
    expect(validateStayDates("2026-07-01", "2026-07-05")).toEqual({
      ok: true,
      checkIn: "2026-07-01",
      checkOut: "2026-07-05",
    });
  });
});

describe("stayRangesOverlap", () => {
  it("detects overlap", () => {
    expect(stayRangesOverlap("2026-07-01", "2026-07-05", "2026-07-03", "2026-07-08")).toBe(true);
  });

  it("allows adjacent stays", () => {
    expect(stayRangesOverlap("2026-07-01", "2026-07-05", "2026-07-05", "2026-07-08")).toBe(false);
  });
});

describe("eachStayNight", () => {
  it("lists nights excluding checkout", () => {
    expect(eachStayNight("2026-07-01", "2026-07-04")).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
    ]);
  });
});

describe("validateLatLng", () => {
  it("accepts empty coords", () => {
    expect(validateLatLng("", "")).toEqual({ ok: true });
  });

  it("rejects partial coords", () => {
    expect(validateLatLng("41.0", "")).toEqual({
      ok: false,
      error: "Enlem ve boylam birlikte girilmelidir.",
    });
  });
});

describe("parseStayDate", () => {
  it("parses ISO date", () => {
    expect(parseStayDate("2026-07-01")).toBeInstanceOf(Date);
  });

  it("rejects invalid", () => {
    expect(parseStayDate("not-a-date")).toBeNull();
  });
});

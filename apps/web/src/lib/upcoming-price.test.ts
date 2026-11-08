import { describe, expect, it } from "vitest";
import { formatUpcomingFrom, resolveUpcomingFromPrice, type GuestRoomPricingInput } from "./guest-pricing";
import type { RateLike } from "./price";

const room = (id: string, rates: RateLike[], over: Partial<GuestRoomPricingInput["room"]> = {}): GuestRoomPricingInput => ({
  room: { id, priceMinor: null, currency: "TRY", priceOnRequest: true, discountPercent: null, discountLabel: null, ...over },
  rates,
});
const rate = (over: Partial<RateLike>): RateLike => ({
  name: "Dönem",
  startDate: "2026-11-14",
  endDate: "2026-11-23",
  priceMinor: 750_000,
  currency: "TRY",
  ...over,
});
const TODAY = "2026-11-08";

describe("resolveUpcomingFromPrice", () => {
  it("bugün fiyatı olmayan otelde en yakın dönemin en düşük fiyatını döner", () => {
    const result = resolveUpcomingFromPrice(
      [
        room("a", [rate({ priceMinor: 750_000 })]),
        room("b", [rate({ priceMinor: 800_000 })]),
        room("c", [rate({ startDate: "2027-01-23", endDate: "2027-02-05", priceMinor: 500_000 })]),
      ],
      TODAY,
    );
    expect(result).toEqual({ priceMinor: 750_000, currency: "TRY", fromDate: "2026-11-14" });
  });

  it("dönem yoksa ya da hepsi geçmişteyse null döner", () => {
    expect(resolveUpcomingFromPrice([room("a", [])], TODAY)).toBeNull();
    expect(
      resolveUpcomingFromPrice([room("a", [rate({ startDate: "2026-10-01", endDate: "2026-10-31" })])], TODAY),
    ).toBeNull();
  });

  it("yalnız belli günlerde geçerli dönemde ilk uygun geceyi bulur", () => {
    // 2026-11-14 Cumartesi; dönem yalnız Pazartesi (1) geceleri.
    const result = resolveUpcomingFromPrice([room("a", [rate({ weekdays: [1] })])], TODAY);
    expect(result?.fromDate).toBe("2026-11-16");
  });

  it("en az gece koşullu dönemi o süreyle fiyatlar", () => {
    const result = resolveUpcomingFromPrice([room("a", [rate({ stayMinNights: 3, priceMinor: 600_000 })])], TODAY);
    expect(result).toEqual({ priceMinor: 600_000, currency: "TRY", fromDate: "2026-11-14" });
  });

  it("sürmekte olan dönemde gün koşulu bugünü dışarıda bırakıyorsa yarından itibaren arar", () => {
    const result = resolveUpcomingFromPrice(
      [room("a", [rate({ startDate: "2026-11-01", endDate: "2026-11-30", weekdays: [3] })])],
      TODAY,
    );
    // 2026-11-11 Çarşamba.
    expect(result?.fromDate).toBe("2026-11-11");
  });
});

describe("formatUpcomingFrom", () => {
  it("aynı yıl için ay ekini doğru yazar", () => {
    expect(formatUpcomingFrom("2026-11-14", TODAY)).toBe("14 Kasım'dan itibaren");
    expect(formatUpcomingFrom("2026-12-01", TODAY)).toBe("1 Aralık'tan itibaren");
  });

  it("farklı yılda yılı ve ekini yazar", () => {
    expect(formatUpcomingFrom("2027-01-23", TODAY)).toBe("23 Ocak 2027'den itibaren");
    expect(formatUpcomingFrom("2030-09-01", TODAY)).toBe("1 Eylül 2030'dan itibaren");
    expect(formatUpcomingFrom("2026-09-01", "2025-01-01")).toBe("1 Eylül 2026'dan itibaren");
  });
});

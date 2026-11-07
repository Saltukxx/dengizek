import { describe, expect, it } from "vitest";
import { quoteStayNights, resolveGuestRoomPrice, type GuestPromotion } from "./guest-pricing";
import { pickRate, type RateLike } from "./price";
import { eachStayNight } from "./stay-dates";

const room = {
  id: "r1",
  priceMinor: null,
  currency: "TRY",
  priceOnRequest: true,
  discountPercent: null,
  discountLabel: null,
};
const rate = (over: Partial<RateLike>): RateLike => ({
  name: "Ana dönem",
  startDate: "2026-11-01",
  endDate: "2026-12-31",
  priceMinor: 100_000,
  currency: "TRY",
  ...over,
});

describe("koşullu dönem fiyatı", () => {
  // 2026-11-06 Cuma, 2026-11-07 Cumartesi, 2026-11-08 Pazar.
  const weekend = rate({ name: "Cuma-Cumartesi", weekdays: [5, 6], priceMinor: 120_000 });
  const saturdaySingle = rate({ name: "Cumartesi tek gece", weekdays: [6], stayMaxNights: 1, priceMinor: 150_000 });
  const longStay = rate({ name: "3 gece ve üzeri", stayMinNights: 3, priceMinor: 90_000 });
  const all = [rate({}), weekend, saturdaySingle, longStay];

  it("hafta sonu dönemi yalnız Cuma ve Cumartesi gecesi geçerli", () => {
    expect(pickRate([rate({}), weekend], "2026-11-06", 2)?.name).toBe("Cuma-Cumartesi");
    expect(pickRate([rate({}), weekend], "2026-11-08", 2)?.name).toBe("Ana dönem");
  });

  it("tek gece Cumartesi fiyatı yalnız tek gecelik konaklamada uygulanır", () => {
    expect(pickRate(all, "2026-11-07", 1)?.name).toBe("Cumartesi tek gece");
    expect(pickRate([rate({}), saturdaySingle], "2026-11-07", 2)?.name).toBe("Ana dönem");
  });

  it("süre koşullu dönem: en az 3 gecede uygulanır; süre bilinmiyorsa uygulanmaz", () => {
    expect(pickRate([rate({}), longStay], "2026-11-10", 3)?.name).toBe("3 gece ve üzeri");
    expect(pickRate([rate({}), longStay], "2026-11-10", 2)?.name).toBe("Ana dönem");
    expect(pickRate([rate({}), longStay], "2026-11-10")?.name).toBe("Ana dönem");
  });
});

describe("kaçıncı çocuk kuralı", () => {
  // Akrones: 2-5 yaş 1. çocuk ücretsiz, 2. çocuk 4.250; 6-11 yaş 4.250.
  const bands = [
    { ageFrom: 0, ageTo: 1, mode: "ucretsiz" as const },
    { ageFrom: 2, ageTo: 5, mode: "ucretsiz" as const, childOrder: 1 as const },
    { ageFrom: 2, ageTo: 5, mode: "sabit" as const, priceMinor: 425_000, childOrder: 2 as const },
    { ageFrom: 6, ageTo: 11, mode: "sabit" as const, priceMinor: 425_000 },
  ];
  const input = (childAges: number[]) => ({
    room,
    rates: [rate({ priceMinor: 1_700_000, childAgePrices: bands })],
    date: "2026-11-10",
    nights: 1,
    childAges,
  });

  it("iki küçük çocukta büyüğü 1. çocuk (ücretsiz), küçüğü 2. çocuk", () => {
    const price = resolveGuestRoomPrice(input([3, 5]));
    expect(price.childBreakdown).toEqual([
      { age: 3, priceMinor: 425_000 },
      { age: 5, priceMinor: 0 },
    ]);
  });

  it("büyük çocuk 6-11 bandında öder; küçük kardeş 2. çocuk olur", () => {
    expect(resolveGuestRoomPrice(input([8, 4])).childSurchargeMinor).toBe(425_000 + 425_000);
  });

  it("tek çocuk 2-5 yaşta ücretsiz", () => {
    expect(resolveGuestRoomPrice(input([4])).childSurchargeMinor).toBe(0);
  });
});

describe("kal-öde kampanyası", () => {
  const rates = [
    rate({ priceMinor: 100_000 }),
    rate({ name: "Cuma-Cumartesi", weekdays: [5, 6], priceMinor: 120_000 }),
  ];
  const stayPay: GuestPromotion = {
    name: "Çok kal az öde",
    discountPercent: null,
    stayPayTiers: [{ stay: 4, pay: 3 }, { stay: 5, pay: 4 }, { stay: 8, pay: 6 }],
    freeNightRule: "hafta_ici",
    validFrom: "2026-11-01",
    validTo: "2026-12-30",
    minNights: null,
    roomIds: [],
    isActive: true,
  };
  const quote = (checkIn: string, checkOut: string, promotions: GuestPromotion[] = [stayPay]) =>
    quoteStayNights({ room, rates, promotions }, eachStayNight(checkIn, checkOut));

  it("4 kal 3 öde: ücretsiz gece hafta içinden düşülür (hafta sonu daha pahalı olsa da)", () => {
    // Per 5 Kas → Pzt 9 Kas: Per, Cum, Cmt, Paz geceleri.
    const q = quote("2026-11-05", "2026-11-09");
    expect(q.totalMinor).toBe(100_000 + 120_000 + 120_000);
    expect(q.stayPromotion).toEqual({ name: "Çok kal az öde", freeNights: 1 });
    expect(q.nights.filter((n) => n.free)).toHaveLength(1);
    expect(q.originalTotalMinor).toBe(440_000);
  });

  it("9 gece → en büyük uygun basamak (8 kal 6 öde)", () => {
    expect(quote("2026-11-09", "2026-11-18").stayPromotion?.freeNights).toBe(2);
  });

  it("konaklama kampanya dönemini aşarsa uygulanmaz; 3 gece basamağa ulaşmaz", () => {
    expect(quote("2026-12-28", "2027-01-02").stayPromotion).toBeNull();
    expect(quote("2026-11-09", "2026-11-12").stayPromotion).toBeNull();
  });

  it("yüzde kampanyasıyla birleşmez: misafir daha ucuz olanı öder", () => {
    const percent: GuestPromotion = { name: "%30 indirim", discountPercent: 30, validFrom: null, validTo: null, minNights: null, roomIds: [], isActive: true };
    const q = quote("2026-11-09", "2026-11-13", [stayPay, percent]); // 4 hafta içi gece
    expect(q.totalMinor).toBe(280_000); // %30 > 4 kal 3 öde (%25)
    expect(q.discountLabel).toBe("%30 indirim");
    expect(q.stayPromotion).toBeNull();
  });

  it("dönem fiyatı olmayan gece varsa toplam alınmaz", () => {
    const q = quote("2026-12-30", "2027-01-02", []);
    expect(q.totalMinor).toBeNull();
    expect(q.unpricedDate).toBe("2027-01-01");
  });
});

describe("kampanya koşulları: rezervasyon tarihi, en fazla gece, kontenjan", () => {
  const rates = [rate({ priceMinor: 100_000 })];
  const promo = (over: Partial<GuestPromotion>): GuestPromotion => ({
    name: "Fırsat", discountPercent: 20, validFrom: null, validTo: null, minNights: null, roomIds: [], isActive: true, ...over,
  });
  const total = (promotions: GuestPromotion[], checkIn: string, checkOut: string, bookingDate = "2026-11-04") =>
    quoteStayNights({ room, rates, promotions, bookingDate }, eachStayNight(checkIn, checkOut)).totalMinor;

  it("son rezervasyon tarihi geçince kampanya uygulanmaz", () => {
    const p = [promo({ bookableTo: "2026-11-21" })];
    expect(total(p, "2026-12-01", "2026-12-03", "2026-11-21")).toBe(160_000);
    expect(total(p, "2026-12-01", "2026-12-03", "2026-11-22")).toBe(200_000);
  });

  it("erken rezervasyon: ilk rezervasyon tarihinden önce geçmez", () => {
    expect(total([promo({ bookableFrom: "2026-11-10" })], "2026-12-01", "2026-12-03")).toBe(200_000);
  });

  it("2 ve 3 gecelik fırsat: 4 gecede geçmez", () => {
    const p = [promo({ minNights: 2, maxNights: 3 })];
    expect(total(p, "2026-12-01", "2026-12-04")).toBe(240_000);
    expect(total(p, "2026-12-01", "2026-12-05")).toBe(400_000);
  });

  it("kontenjanı dolan gecede kampanya o gece uygulanmaz; kal-öde hiç uygulanmaz", () => {
    const soldOut = { r1: ["2026-12-02"] };
    expect(total([promo({ soldOut })], "2026-12-01", "2026-12-04")).toBe(80_000 + 100_000 + 80_000);
    const stayPay = promo({ discountPercent: null, stayPayTiers: [{ stay: 3, pay: 2 }], soldOut });
    expect(total([stayPay], "2026-12-01", "2026-12-04")).toBe(300_000);
  });
});

describe("kampanya kontenjanı sayımı", () => {
  it("kampanyalı rezervasyonları oda ve gece bazında sayar, dolan geceleri verir", async () => {
    const { countPromotionUsage, soldOutNights } = await import("./promotion-allotment");
    const usage = countPromotionUsage([
      { promotionId: "p1", roomId: "r1", checkIn: "2026-12-01", checkOut: "2026-12-03" },
      { promotionId: "p1", roomId: "r1", checkIn: "2026-12-02", checkOut: "2026-12-04" },
      { promotionId: "p1", roomId: "r2", checkIn: "2026-12-02", checkOut: "2026-12-03" },
      { promotionId: null, roomId: "r1", checkIn: "2026-12-02", checkOut: "2026-12-03" },
    ]);
    expect(soldOutNights({ id: "p1", allotment: 2, roomIds: [] }, usage)).toEqual({ r1: ["2026-12-02"] });
    expect(soldOutNights({ id: "p1", allotment: null, roomIds: [] }, usage)).toEqual({});
  });
});

describe("satış kısıtları (stop sale)", () => {
  it("stop sale, dolu, girişe/çıkışa kapalı ve minimum konaklama", async () => {
    const { roomRestriction } = await import("./stay-search");
    const nights = eachStayNight("2026-12-01", "2026-12-03");
    expect(roomRestriction({ "2026-12-02": { stopSell: true } }, "2026-12-01", "2026-12-03", nights).reason).toBe("Bu tarihlerde satışa kapalı");
    expect(roomRestriction({ "2026-12-01": { full: true } }, "2026-12-01", "2026-12-03", nights).reason).toBe("Bu tarihlerde müsait oda yok");
    expect(roomRestriction({ "2026-12-01": { cta: true } }, "2026-12-01", "2026-12-03", nights).reason).toContain("girişe kapalı");
    expect(roomRestriction({ "2026-12-03": { ctd: true } }, "2026-12-01", "2026-12-03", nights).reason).toContain("çıkışa kapalı");
    expect(roomRestriction({ "2026-12-01": { minStay: 3 } }, "2026-12-01", "2026-12-03", nights)).toEqual({ reason: null, minStay: 3 });
    expect(roomRestriction(undefined, "2026-12-01", "2026-12-03", nights).reason).toBeNull();
  });
});

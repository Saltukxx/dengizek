import { describe, expect, it } from "vitest";
import type { GuestPromotion } from "./guest-pricing";
import { bestPromotionBadge, describePromotion, groupedPromotionDisplays, guestVisiblePromotions, promotionHeadline, stayPayUpsell, tierSummary } from "./promotion-display";

const today = "2026-11-05";
const base = (over: Partial<GuestPromotion>): GuestPromotion => ({
  name: "Kampanya", discountPercent: null, validFrom: null, validTo: null, minNights: null, roomIds: [], isActive: true, ...over,
});
const stayPay = base({
  name: "Çok kal az öde",
  stayPayTiers: [{ stay: 4, pay: 3 }, { stay: 5, pay: 4 }, { stay: 8, pay: 6 }],
  freeNightRule: "hafta_ici",
  validFrom: "2026-10-23",
  validTo: "2026-12-30",
});

describe("guestVisiblePromotions", () => {
  it("süresi geçmiş, son rezervasyonu geçmiş, erken rezervasyonu başlamamış ve pasif kampanyaları gizler", () => {
    const list = [
      stayPay,
      base({ name: "Bitti", discountPercent: 10, validTo: "2026-11-01" }),
      base({ name: "Son rez. geçti", discountPercent: 10, bookableTo: "2026-11-04" }),
      base({ name: "Erken", discountPercent: 10, bookableFrom: "2026-12-01" }),
      base({ name: "Pasif", discountPercent: 10, isActive: false }),
    ];
    expect(guestVisiblePromotions(list, today).map((p) => p.name)).toEqual(["Çok kal az öde"]);
  });
});

describe("anlatım", () => {
  it("çok basamaklı kal-öde başlığı, kuralları ve dönemi", () => {
    expect(promotionHeadline(stayPay)).toBe("4 kal 3 öde · 8 kal 6 öde'ye kadar");
    const d = describePromotion(stayPay, today);
    expect(d.conditions[0]).toBe("4-5 gece kalana 1, 8 gece kalana 2 gece hediye");
    expect(d.conditions).toContain("Hediye gece hafta içinden düşülür");
    expect(tierSummary([{ stay: 4, pay: 3 }, { stay: 5, pay: 4 }, { stay: 6, pay: 5 }, { stay: 7, pay: 6 }, { stay: 8, pay: 6 }])).toBe(
      "4-7 gece kalana 1, 8 gece kalana 2 gece hediye",
    );
    expect(tierSummary([{ stay: 5, pay: 4 }, { stay: 7, pay: 5 }])).toBe("5 gece kalana 1, 7 gece kalana 2 gece hediye");
    expect(d.periods).toEqual([{ label: "5 Kasım – 30 Aralık", bookableTo: null }]);
  });

  it("2-3 gecelik oda kampanyası, son rezervasyon ve kontenjan", () => {
    const p = base({ name: "Sonbahar", discountPercent: 20, minNights: 2, maxNights: 3, roomIds: ["r1"], bookableTo: "2026-11-21", allotment: 10 });
    const d = describePromotion(p, today, { r1: "Standart Oda" });
    expect(d.headline).toBe("%20 indirim");
    expect(d.conditions).toEqual(["2-3 gecelik konaklamada", "Yalnız Standart Oda"]);
    expect(d.periods[0].bookableTo).toBe("21 Kasım");
    expect(d.limited).toBe(true);
  });

  it("aynı kurallı kampanyanın dönemleri tek kartta toplanır", () => {
    const jan = { ...stayPay, validFrom: "2027-01-03", validTo: "2027-01-22" };
    const cards = groupedPromotionDisplays([jan, stayPay, base({ name: "Başka", discountPercent: 10 })], today);
    expect(cards).toHaveLength(2);
    expect(cards.find((c) => c.name === "Çok kal az öde")?.periods.map((p) => p.label)).toEqual([
      "5 Kasım – 30 Aralık",
      "3 Ocak 2027 – 22 Ocak 2027",
    ]);
  });

  it("kart etiketi en cömert kampanyayı seçer", () => {
    expect(bestPromotionBadge([base({ discountPercent: 15 }), stayPay], today)).toBe("4 kal 3 öde"); // %25 > %15
    expect(bestPromotionBadge([base({ discountPercent: 30 }), stayPay], today)).toBe("%30 indirim");
    expect(bestPromotionBadge([], today)).toBeNull();
  });
});

describe("stayPayUpsell", () => {
  it("3 gece seçene 1 gece daha kalmasını önerir; dönem dışına taşarsa önermez", () => {
    expect(stayPayUpsell([stayPay], ["r1"], "2026-12-01", 3, today)).toEqual({
      text: "1 gece daha kalırsanız Çok kal az öde ile 1 geceniz ücretsiz (4 kal 3 öde).",
      extraNights: 1,
    });
    expect(stayPayUpsell([stayPay], ["r1"], "2026-12-28", 3, today)).toBeNull();
  });

  it("6-7 gecede bir üst hediye basamağını (8 kal 6 öde) önerir; uzak basamak önerilmez", () => {
    expect(stayPayUpsell([stayPay], ["r1"], "2026-11-10", 7, today)?.text).toContain("2 geceniz ücretsiz (8 kal 6 öde)");
    expect(stayPayUpsell([stayPay], ["r1"], "2026-11-10", 1, today)).toBeNull();
  });
});

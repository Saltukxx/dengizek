import { describe, expect, it } from "vitest";
import { PRICE_ALERT_MIN_INTERVAL_MS, priceAlertDecision, priceDropAlert } from "./price-alerts";

const now = new Date("2026-11-10T07:00:00.000Z");
const target = (lastPriceMinor: number | null, lastNotifiedAt: Date | null = null) => ({ lastPriceMinor, lastNotifiedAt });

describe("fiyat düşüşü bildirimi kararı", () => {
  it("fiyat yoksa (talep üzerine) kayıt aynen kalır", () => {
    expect(priceAlertDecision(target(800000), null, now)).toEqual({ notify: false, nextPriceMinor: 800000 });
  });

  it("ilk fiyat yalnız kaydedilir, bildirim gitmez", () => {
    expect(priceAlertDecision(target(null), 800000, now)).toEqual({ notify: false, nextPriceMinor: 800000 });
  });

  it("%5 ve üzeri düşüşte bildirir; daha küçük oynamada bildirmez ama fiyatı kaydeder", () => {
    expect(priceAlertDecision(target(800000), 760000, now)).toEqual({ notify: true, nextPriceMinor: 760000 });
    expect(priceAlertDecision(target(800000), 790000, now)).toEqual({ notify: false, nextPriceMinor: 790000 });
  });

  it("fiyat artışı bildirilmez, sonraki düşüş yeni fiyata göre ölçülür", () => {
    expect(priceAlertDecision(target(800000), 900000, now)).toEqual({ notify: false, nextPriceMinor: 900000 });
  });

  it("aynı otel için 24 saatte en çok bir bildirim", () => {
    const recent = new Date(now.getTime() - PRICE_ALERT_MIN_INTERVAL_MS + 60_000);
    const old = new Date(now.getTime() - PRICE_ALERT_MIN_INTERVAL_MS);
    expect(priceAlertDecision(target(800000, recent), 600000, now)).toEqual({ notify: false, nextPriceMinor: 600000 });
    expect(priceAlertDecision(target(800000, old), 600000, now).notify).toBe(true);
  });

  it("bildirim metni iki fiyatı ve otelin kısa adını taşır", () => {
    const alert = priceDropAlert({ slug: "kar-zirvesi", name: "Kar Zirvesi" }, 890000, 760000);
    expect(alert.title).toBe("Fiyat düştü");
    expect(alert.body).toContain("Kar Zirvesi");
    expect(alert.body).toContain("8.900");
    expect(alert.body).toContain("7.600");
    expect(alert.data).toEqual({ hotelSlug: "kar-zirvesi" });
  });
});

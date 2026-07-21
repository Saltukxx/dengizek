import { describe, expect, it } from "vitest";
import {
  getVideoContentRect,
  hotspotPctToStylePosition,
  isHotspotPositionVisible,
} from "./tour-video-bounds";

describe("getVideoContentRect", () => {
  it("kare piksel kare alana sığar (contain = cover)", () => {
    for (const fit of ["contain", "cover"] as const) {
      const r = getVideoContentRect(100, 100, 10, 10, fit);
      expect(r).toEqual({ left: 0, top: 0, width: 100, height: 100 });
    }
  });

  it("contain: geniş video letterbox olur", () => {
    // 16:9 video, kare container → yükseklik küçülür, üst/alt boşluk kalır
    const r = getVideoContentRect(100, 100, 160, 90, "contain");
    expect(r.width).toBe(100);
    expect(r.height).toBeCloseTo(56.25);
    expect(r.left).toBe(0);
    expect(r.top).toBeCloseTo((100 - 56.25) / 2);
  });

  it("cover: geniş video yatayda taşar (negatif left)", () => {
    // 16:9 video, kare container → yükseklik dolar, genişlik taşar
    const r = getVideoContentRect(100, 100, 160, 90, "cover");
    expect(r.height).toBe(100);
    expect(r.width).toBeCloseTo(1600 / 9);
    expect(r.top).toBe(0);
    expect(r.left).toBeCloseTo((100 - 1600 / 9) / 2);
    expect(r.left).toBeLessThan(0);
  });

  it("cover: uzun video dikeyde taşar (negatif top)", () => {
    // 9:16 video, yatay container → genişlik dolar, yükseklik taşar
    const r = getVideoContentRect(160, 90, 90, 160, "cover");
    expect(r.width).toBe(160);
    expect(r.height).toBeCloseTo((160 / 90) * 160);
    expect(r.left).toBe(0);
    expect(r.top).toBeLessThan(0);
  });

  it("fit belirtilmezse cover varsayılır", () => {
    const explicit = getVideoContentRect(100, 100, 160, 90, "cover");
    const implicit = getVideoContentRect(100, 100, 160, 90);
    expect(implicit).toEqual(explicit);
  });

  it("geçersiz boyutlarda güvenli döner", () => {
    expect(getVideoContentRect(0, 100, 10, 10)).toEqual({ left: 0, top: 0, width: 0, height: 0 });
    expect(getVideoContentRect(100, 100, 0, 0)).toEqual({ left: 0, top: 0, width: 100, height: 100 });
  });
});

describe("hotspotPctToStylePosition", () => {
  it("yüzde", () => {
    const p = hotspotPctToStylePosition(0, 0, { left: 10, top: 20, width: 100, height: 200 });
    expect(p).toEqual({ left: 10, top: 20 });
  });

  it("negatif offsetli cover rect'inde konum kayar", () => {
    const rect = { left: -40, top: 0, width: 180, height: 100 };
    const p = hotspotPctToStylePosition(50, 50, rect);
    expect(p).toEqual({ left: 50, top: 50 });
  });
});

describe("isHotspotPositionVisible", () => {
  // Kare container (100x100), geniş video cover: yatayda ~%22 kırpılır
  const rect = getVideoContentRect(100, 100, 160, 90, "cover");

  it("merkezdeki pin görünür", () => {
    expect(isHotspotPositionVisible(50, 50, rect, 100, 100)).toBe(true);
  });

  it("kırpılan sol kenardaki pin gizlenir", () => {
    expect(isHotspotPositionVisible(2, 50, rect, 100, 100)).toBe(false);
  });

  it("kırpılan sağ kenardaki pin gizlenir", () => {
    expect(isHotspotPositionVisible(98, 50, rect, 100, 100)).toBe(false);
  });

  it("contain rect'inde tüm pinler görünür", () => {
    const containRect = getVideoContentRect(100, 100, 160, 90, "contain");
    expect(isHotspotPositionVisible(0, 0, containRect, 100, 100)).toBe(true);
    expect(isHotspotPositionVisible(100, 100, containRect, 100, 100)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  clampTimeInWindow,
  formatTimeLabel,
  getClipEndSec,
  getClipStartSec,
  isPastClipEnd,
} from "./tour-clip-helpers";

describe("getClipStartSec", () => {
  it("startSec yokken 0", () => {
    expect(getClipStartSec({})).toBe(0);
  });
  it("startSec uygular", () => {
    expect(getClipStartSec({ startSec: 3.5 })).toBe(3.5);
  });
});

describe("getClipEndSec", () => {
  it("endSec yokken dosya süresi", () => {
    expect(getClipEndSec({}, 10)).toBe(10);
  });
  it("endSec dosyadan küçük kırpılır", () => {
    expect(getClipEndSec({ endSec: 8 }, 6)).toBe(6);
  });
  it("d 0 iken sadece endSec", () => {
    expect(getClipEndSec({ endSec: 4 }, 0)).toBe(4);
  });
});

describe("clampTimeInWindow", () => {
  it("içeride bırakır", () => {
    expect(clampTimeInWindow(2, 1, 5)).toBe(2);
  });
  it("alt ve üst sınır", () => {
    expect(clampTimeInWindow(0, 2, 5)).toBe(2);
    expect(clampTimeInWindow(10, 2, 5)).toBe(5);
  });
  it("geçersiz pencerede başa", () => {
    expect(clampTimeInWindow(3, 4, 3)).toBe(4);
  });
});

describe("isPastClipEnd", () => {
  it("eşiği aşar", () => {
    expect(isPastClipEnd(4.9, 5, 0.12)).toBe(true);
  });
  it("daha erken değil", () => {
    expect(isPastClipEnd(4.5, 5, 0.12)).toBe(false);
  });
});

describe("formatTimeLabel", () => {
  it("dakika:saniye", () => {
    expect(formatTimeLabel(65)).toBe("1:05");
  });
});

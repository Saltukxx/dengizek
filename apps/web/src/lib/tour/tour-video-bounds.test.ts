import { describe, expect, it } from "vitest";
import { getVideoContentRect, hotspotPctToStylePosition } from "./tour-video-bounds";

describe("getVideoContentRect", () => {
  it("kare piksel kare alana sığar", () => {
    const r = getVideoContentRect(100, 100, 10, 10);
    expect(r.width).toBe(100);
    expect(r.height).toBe(100);
    expect(r.left).toBe(0);
    expect(r.top).toBe(0);
  });
});

describe("hotspotPctToStylePosition", () => {
  it("yüzde", () => {
    const p = hotspotPctToStylePosition(0, 0, { left: 10, top: 20, width: 100, height: 200 });
    expect(p).toEqual({ left: 10, top: 20 });
  });
});

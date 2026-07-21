import { describe, expect, it } from "vitest";
import { hasValidImageSignature } from "./object-storage";

describe("image signature validation", () => {
  it("MIME başlığıyla gerçek içeriği eşleştirir", () => {
    expect(hasValidImageSignature("image/jpeg", Uint8Array.from([0xff, 0xd8, 0xff, 0x00]))).toBe(true);
    expect(hasValidImageSignature("image/png", Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBe(true);
    expect(hasValidImageSignature("image/jpeg", Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
  });

  it("bilinmeyen MIME türünü reddeder", () => {
    expect(hasValidImageSignature("image/svg+xml", new Uint8Array())).toBe(false);
  });
});

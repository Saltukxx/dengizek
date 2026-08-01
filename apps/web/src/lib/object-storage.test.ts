import { describe, expect, it } from "vitest";
import {
  hasSafeImageDimensions,
  hasValidImageSignature,
  readImageDimensions,
} from "./object-storage";

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

// ---------------------------------------------------------------------------
// Piksel bombası koruması
// ---------------------------------------------------------------------------

function pngWith(width: number, height: number): Uint8Array {
  const b = new Uint8Array(24);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); // imza
  b.set([0, 0, 0, 13], 8); // IHDR uzunluk
  b.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

function gifWith(width: number, height: number): Uint8Array {
  const b = new Uint8Array(10);
  b.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0); // "GIF89a"
  new DataView(b.buffer).setUint16(6, width, true);
  new DataView(b.buffer).setUint16(8, height, true);
  return b;
}

describe("readImageDimensions", () => {
  it("PNG boyutlarını okur", () => {
    expect(readImageDimensions("image/png", pngWith(1920, 1080))).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it("GIF boyutlarını okur (little-endian)", () => {
    expect(readImageDimensions("image/gif", gifWith(640, 480))).toEqual({
      width: 640,
      height: 480,
    });
  });

  it("çok kısa tamponda null döner", () => {
    expect(readImageDimensions("image/png", new Uint8Array(8))).toBeNull();
  });
});

describe("hasSafeImageDimensions", () => {
  it("normal fotoğrafı kabul eder", () => {
    expect(hasSafeImageDimensions("image/png", pngWith(4000, 3000))).toBe(true);
  });

  it("piksel bombasını reddeder (50 MP üstü)", () => {
    // 40 KB'lık dosya 50.000×50.000 ilan edebilir → 2,5 milyar piksel
    expect(hasSafeImageDimensions("image/png", pngWith(50_000, 50_000))).toBe(false);
  });

  it("aşırı uzun tek kenarı reddeder", () => {
    expect(hasSafeImageDimensions("image/png", pngWith(30_000, 10))).toBe(false);
  });

  it("sıfır boyutu reddeder", () => {
    expect(hasSafeImageDimensions("image/png", pngWith(0, 100))).toBe(false);
  });

  it("boyut okunamıyorsa reddetmez (magic-byte zaten geçmiş)", () => {
    expect(hasSafeImageDimensions("image/webp", new Uint8Array(4))).toBe(true);
  });
});

describe("SVG kabul edilmez", () => {
  it("SVG imzası doğrulanamaz — allowlist dışı kalmalı", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(hasValidImageSignature("image/svg+xml", svg)).toBe(false);
    // XSS vektörü: SVG içine script gömülebilir, bu yüzden hiç kabul etmiyoruz.
  });
});

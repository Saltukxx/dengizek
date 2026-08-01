import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSignedSourceMap, signManifestMedia } from "@/lib/bunny/sign-manifest";
import type { TourManifest } from "@/lib/schemas/tour-manifest";

const baseManifest = {
  tourId: "demo",
  hotelSlug: "aurelia-bay",
  version: 1,
  steps: [
    {
      stepId: "s1",
      order: 0,
      kind: "lobby",
      title: "Lobi",
      requiresUserContinue: false,
      media: { mode: "clip", src: "https://cdn.example.net/guid-1/playlist.m3u8" },
      captionsVttUrl: "https://cdn.example.net/guid-1/captions.vtt",
    },
    {
      stepId: "s2",
      order: 1,
      kind: "room",
      title: "Oda",
      requiresUserContinue: false,
      media: { mode: "clip", src: "/demo/local-sample.mp4" },
    },
  ],
} as unknown as TourManifest;

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.BUNNY_CDN_TOKEN_KEY = "test-key";
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("signManifestMedia", () => {
  it("her adımın medya URL'ini imzalar", () => {
    const signed = signManifestMedia(baseManifest, 600);
    const s1 = new URL(signed.steps[0].media.src);
    expect(s1.searchParams.get("token")).toMatch(/^HS256-/);
    expect(s1.searchParams.get("token_path")).toBe("/guid-1/");
  });

  it("altyazı URL'ini de imzalar", () => {
    const signed = signManifestMedia(baseManifest, 600);
    expect(signed.steps[0].captionsVttUrl).toContain("token=HS256-");
  });

  it("mediaTokenExpiresAt ekler", () => {
    const before = Math.floor(Date.now() / 1000);
    const signed = signManifestMedia(baseManifest, 600);
    expect(signed.mediaTokenExpiresAt).toBeGreaterThanOrEqual(before + 600);
  });

  it("mock/göreli medyayı olduğu gibi bırakır", () => {
    const signed = signManifestMedia(baseManifest, 600);
    expect(signed.steps[1].media.src).toBe("/demo/local-sample.mp4");
  });

  it("orijinal manifesti değiştirmez (kopya döner)", () => {
    const original = baseManifest.steps[0].media.src;
    signManifestMedia(baseManifest, 600);
    expect(baseManifest.steps[0].media.src).toBe(original);
  });

  it("imzalama kapalıysa manifest aynen döner — expiry de eklenmez", () => {
    delete process.env.BUNNY_CDN_TOKEN_KEY;
    const signed = signManifestMedia(baseManifest, 600);
    expect(signed).toBe(baseManifest);
    expect(signed.mediaTokenExpiresAt).toBeUndefined();
  });
});

describe("buildSignedSourceMap", () => {
  it("adım→URL haritası çıkarır, tekrar imzalamaz", () => {
    const signed = signManifestMedia(baseManifest, 600);
    const { sources, mediaTokenExpiresAt } = buildSignedSourceMap(signed);
    expect(sources.s1).toBe(signed.steps[0].media.src);
    expect(sources.s2).toBe("/demo/local-sample.mp4");
    expect(mediaTokenExpiresAt).toBe(signed.mediaTokenExpiresAt);
  });

  it("imzasız manifestte expiry null döner", () => {
    const { mediaTokenExpiresAt } = buildSignedSourceMap(baseManifest);
    expect(mediaTokenExpiresAt).toBeNull();
  });
});

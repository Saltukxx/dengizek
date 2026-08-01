// ---------------------------------------------------------------------------
// Yenileme ucu testleri — yetkilendirme yayın görünürlüğüdür.
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getPublishedHotelBySlugMock = vi.fn();
vi.mock("@/lib/hotels-repo", () => ({
  getPublishedHotelBySlug: (...a: unknown[]) => getPublishedHotelBySlugMock(...a),
}));

const getPublishedManifestMock = vi.fn();
vi.mock("@/lib/db/manifest", () => ({
  getPublishedManifest: (...a: unknown[]) => getPublishedManifestMock(...a),
}));

vi.mock("@/lib/db", () => ({ isDbConfigured: () => true }));

const rateLimitOk = vi.fn<() => Promise<boolean>>();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => rateLimitOk(),
  requestIp: () => "1.2.3.4",
}));

import { GET } from "./route";

const manifest = {
  tourId: "demo",
  hotelSlug: "aurelia-bay",
  version: 1,
  steps: [
    { stepId: "s1", media: { src: "https://cdn/x/playlist.m3u8?token=A&expires=99" } },
    { stepId: "s2", media: { src: "https://cdn/y/playlist.m3u8?token=B&expires=99" } },
  ],
  mediaTokenExpiresAt: 99,
};

function req(qs = "hotelSlug=aurelia-bay&tourId=demo") {
  return new Request(`http://x/api/tour/playback-token?${qs}`);
}

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.BUNNY_CDN_TOKEN_KEY = "k";
  rateLimitOk.mockReset();
  rateLimitOk.mockResolvedValue(true);
  getPublishedHotelBySlugMock.mockReset();
  getPublishedHotelBySlugMock.mockResolvedValue({ slug: "aurelia-bay", name: "Aurelia" });
  getPublishedManifestMock.mockReset();
  getPublishedManifestMock.mockResolvedValue(manifest);
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("GET /api/tour/playback-token", () => {
  it("adım→URL haritası ve bitiş zamanı döner", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      signing: true,
      sources: {
        s1: "https://cdn/x/playlist.m3u8?token=A&expires=99",
        s2: "https://cdn/y/playlist.m3u8?token=B&expires=99",
      },
      mediaTokenExpiresAt: 99,
    });
  });

  it("askıya alınmış / yayında olmayan otelde 404", async () => {
    getPublishedHotelBySlugMock.mockResolvedValue(undefined);
    const res = await GET(req());
    expect(res.status).toBe(404);
    // Otel görünmüyorsa manifest hiç okunmamalı.
    expect(getPublishedManifestMock).not.toHaveBeenCalled();
  });

  it("tur bulunamazsa 404", async () => {
    getPublishedManifestMock.mockResolvedValue(undefined);
    const res = await GET(req());
    expect(res.status).toBe(404);
  });

  it("parametre eksikse 400", async () => {
    expect((await GET(req("hotelSlug=aurelia-bay"))).status).toBe(400);
    expect((await GET(req("tourId=demo"))).status).toBe(400);
  });

  it("imzalama kapalıyken signing:false döner ve otel sorgulanmaz", async () => {
    delete process.env.BUNNY_CDN_TOKEN_KEY;
    const res = await GET(req());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ signing: false, mediaTokenExpiresAt: null });
    expect(getPublishedHotelBySlugMock).not.toHaveBeenCalled();
  });

  it("hız limiti aşılırsa 429", async () => {
    rateLimitOk.mockResolvedValue(false);
    expect((await GET(req())).status).toBe(429);
  });
});

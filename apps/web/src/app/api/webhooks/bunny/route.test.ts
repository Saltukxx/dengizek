// ---------------------------------------------------------------------------
// Bunny webhook route testleri
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const limitMock = vi.fn();
const setMock = vi.fn();
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: (...args: unknown[]) => limitMock(...args),
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        setMock(values);
        return { where: () => Promise.resolve() };
      },
    }),
  }),
  isDbConfigured: () => true,
}));

import { POST } from "./route";

function makeRequest(body: unknown, secret?: string) {
  const qs = secret ? `?secret=${secret}` : "";
  return new Request(`http://localhost/api/webhooks/bunny${qs}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = { VideoLibraryId: 123, VideoGuid: "guid-1", Status: 4 };

beforeEach(() => {
  vi.stubEnv("BUNNY_WEBHOOK_SECRET", "test-secret");
  vi.stubEnv("BUNNY_STREAM_CDN_HOSTNAME", "vz-test.b-cdn.net");
  limitMock.mockReset();
  setMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/webhooks/bunny", () => {
  it("yanlış secret için 401 döner", async () => {
    const res = await POST(makeRequest(validBody, "yanlis"));
    expect(res.status).toBe(401);
  });

  it("secret yoksa 401 döner", async () => {
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(401);
  });

  it("BUNNY_WEBHOOK_SECRET tanımsızken 503 döner", async () => {
    vi.stubEnv("BUNNY_WEBHOOK_SECRET", "");
    const res = await POST(makeRequest(validBody, "test-secret"));
    expect(res.status).toBe(503);
  });

  it("Status 4 → hazir + playbackUrl yazar", async () => {
    limitMock.mockResolvedValue([{ id: "m1", status: "isleniyor" }]);
    const res = await POST(makeRequest(validBody, "test-secret"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, status: "hazir" });
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "hazir",
        playbackUrl: "https://vz-test.b-cdn.net/guid-1/playlist.m3u8",
      }),
    );
  });

  it("Status 5 → hata yazar", async () => {
    limitMock.mockResolvedValue([{ id: "m1", status: "isleniyor" }]);
    const res = await POST(makeRequest({ ...validBody, Status: 5 }, "test-secret"));
    await expect(res.json()).resolves.toMatchObject({ ok: true, status: "hata" });
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ status: "hata" }));
  });

  it("Status 1 → isleniyor yazar; hazir kaydı geri çevirmez", async () => {
    limitMock.mockResolvedValue([{ id: "m1", status: "hazir" }]);
    const res = await POST(makeRequest({ ...validBody, Status: 1 }, "test-secret"));
    await expect(res.json()).resolves.toMatchObject({ ok: true, status: "isleniyor" });
    expect(setMock).not.toHaveBeenCalled();
  });

  it("bilinmeyen GUID → 200 + ignored (retry fırtınası önlenir)", async () => {
    limitMock.mockResolvedValue([]);
    const res = await POST(makeRequest(validBody, "test-secret"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, ignored: true });
  });

  it("geçersiz gövde → 400", async () => {
    const res = await POST(makeRequest({ foo: 1 }, "test-secret"));
    expect(res.status).toBe(400);
  });
});

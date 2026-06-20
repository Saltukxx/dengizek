// ---------------------------------------------------------------------------
// Manager otel route testleri — tenant izolasyonu + doğrulama
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const requireHotelAccessMock = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireHotelAccess: (...args: unknown[]) => requireHotelAccessMock(...args),
}));

const returningMock = vi.fn();
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => [
            { id: "hotel-1", slug: "aurelia-bay", name: "Aurelia Bay Otel" },
          ],
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: (...args: unknown[]) => returningMock(...args),
        }),
      }),
    }),
  }),
  isDbConfigured: () => true,
}));

import { GET, PATCH } from "./route";

const okGuard = {
  user: { id: "u1", email: "y@a.dev", name: "Y", role: "manager" as const },
  hotel: { id: "hotel-1", slug: "aurelia-bay" },
  response: null,
};

const deniedGuard = {
  user: null,
  hotel: null,
  response: NextResponse.json(
    { ok: false, error: "Bu tesise erişim yetkiniz yok." },
    { status: 403 },
  ),
};

function makeParams(hotelId: string) {
  return { params: Promise.resolve({ hotelId }) };
}

function makePatch(body: unknown) {
  return new Request("http://localhost/api/manager/hotels/x", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireHotelAccessMock.mockReset();
  returningMock.mockReset();
});

describe("GET /api/manager/hotels/[hotelId]", () => {
  it("yabancı otel için 403 döner (tenant izolasyonu)", async () => {
    requireHotelAccessMock.mockResolvedValue(deniedGuard);
    const res = await GET(new Request("http://localhost"), makeParams("baska-otel"));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: "Bu tesise erişim yetkiniz yok.",
    });
  });

  it("üyelikte otel bilgisi döner", async () => {
    requireHotelAccessMock.mockResolvedValue(okGuard);
    const res = await GET(new Request("http://localhost"), makeParams("aurelia-bay"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      hotel: { slug: "aurelia-bay" },
    });
  });
});

describe("PATCH /api/manager/hotels/[hotelId]", () => {
  it("geçersiz gövdede 400 ve Türkçe hata döner", async () => {
    requireHotelAccessMock.mockResolvedValue(okGuard);
    const res = await PATCH(makePatch({ name: "" }), makeParams("aurelia-bay"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: "Doğrulama başarısız",
    });
  });

  it("geçerli gövdede günceller", async () => {
    requireHotelAccessMock.mockResolvedValue(okGuard);
    returningMock.mockResolvedValue([{ id: "hotel-1", name: "Yeni Ad" }]);
    const res = await PATCH(makePatch({ name: "Yeni Ad" }), makeParams("aurelia-bay"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      hotel: { name: "Yeni Ad" },
    });
  });

  it("yabancı otelde guard 403'ü aynen döner", async () => {
    requireHotelAccessMock.mockResolvedValue(deniedGuard);
    const res = await PATCH(makePatch({ name: "X" }), makeParams("baska-otel"));
    expect(res.status).toBe(403);
  });
});

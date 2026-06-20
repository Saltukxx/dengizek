// ---------------------------------------------------------------------------
// Oda route testleri — tenant izolasyonu + doğrulama
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const requireHotelAccessMock = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireHotelAccess: (...args: unknown[]) => requireHotelAccessMock(...args),
}));

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

const returningMock = vi.fn();
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        // where(...) hem doğrudan await edilir (POST: dizi) hem de
        // orderBy zinciri alır (GET) — dizi + orderBy metodu yeterli
        where: () => Object.assign([] as unknown[], { orderBy: () => [] }),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: (...args: unknown[]) => returningMock(...args),
      }),
    }),
  }),
  isDbConfigured: () => true,
}));

import { GET, POST } from "./route";

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

const validRoom = {
  slug: "deluxe-oda",
  name: "Deluxe Oda",
  capacityAdults: 2,
  capacityChildren: 0,
  amenities: ["Balkon"],
  currency: "TRY",
  priceOnRequest: true,
  isActive: true,
};

function makePost(body: unknown) {
  return new Request("http://localhost/api/manager/hotels/x/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const routeParams = { params: Promise.resolve({ hotelId: "hotel-1" }) };

beforeEach(() => {
  requireHotelAccessMock.mockReset();
  returningMock.mockReset();
});

describe("rooms API", () => {
  it("GET yabancı otelde 403 döner (tenant izolasyonu)", async () => {
    requireHotelAccessMock.mockResolvedValue(deniedGuard);
    const res = await GET(new Request("http://localhost"), routeParams);
    expect(res.status).toBe(403);
  });

  it("POST geçersiz slug'da 400 döner", async () => {
    requireHotelAccessMock.mockResolvedValue(okGuard);
    const res = await POST(makePost({ ...validRoom, slug: "Büyük Oda!" }), routeParams);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(JSON.stringify(json.issues)).toContain("küçük harf");
  });

  it("POST fiyat kuralını uygular: talep üzerine değilse tutar zorunlu", async () => {
    requireHotelAccessMock.mockResolvedValue(okGuard);
    const res = await POST(
      makePost({ ...validRoom, priceOnRequest: false, priceMinor: null }),
      routeParams,
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(JSON.stringify(json.issues)).toContain("Talep üzerine");
  });

  it("POST geçerli odada 201 döner", async () => {
    requireHotelAccessMock.mockResolvedValue(okGuard);
    returningMock.mockResolvedValue([{ id: "r1", ...validRoom }]);
    const res = await POST(makePost(validRoom), routeParams);
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      room: { slug: "deluxe-oda" },
    });
  });
});

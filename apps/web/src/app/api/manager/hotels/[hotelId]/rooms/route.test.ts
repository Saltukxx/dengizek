// ---------------------------------------------------------------------------
// Oda route testleri — tenant izolasyonu + doğrulama
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const requireHotelAccessMock = vi.fn();
const runPanelMutationMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/guards", () => ({
  requireHotelAccess: (...args: unknown[]) => requireHotelAccessMock(...args),
}));

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

vi.mock("@/lib/panel-revision", async () => {
  const actual = await vi.importActual<typeof import("@/lib/panel-revision")>("@/lib/panel-revision");
  return {
    ...actual,
    runPanelMutation: (...args: unknown[]) => runPanelMutationMock(...args),
  };
});

const returningMock = vi.fn();
vi.mock("@/lib/db", () => ({
  getDb: () => {
    const db = {
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
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    };
    return { ...db, transaction: (fn: (tx: typeof db) => unknown) => fn(db) };
  },
  isDbConfigured: () => true,
}));

import { GET, POST } from "./route";
import { PanelRevisionConflict } from "@/lib/panel-revision";

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
    body: JSON.stringify({ ...(body as object), expectedRevision: 1 }),
  });
}

const routeParams = { params: Promise.resolve({ hotelId: "hotel-1" }) };

beforeEach(() => {
  requireHotelAccessMock.mockReset();
  returningMock.mockReset();
  runPanelMutationMock.mockReset();
  runPanelMutationMock.mockImplementation(async ({ mutate }) => ({
    result: await mutate((await import("@/lib/db")).getDb()),
    revision: 2,
  }));
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

  it("POST beklenen revizyon yoksa 400 döner", async () => {
    requireHotelAccessMock.mockResolvedValue(okGuard);
    const req = new Request("http://localhost/api/manager/hotels/x/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRoom),
    });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ code: "EXPECTED_REVISION_REQUIRED" });
  });

  it("aynı eski revizyonla gelen ikinci yazmayı standart 409 ile reddeder", async () => {
    requireHotelAccessMock.mockResolvedValue(okGuard);
    runPanelMutationMock.mockRejectedValueOnce(new PanelRevisionConflict({
      revision: 2,
      updatedAt: new Date("2026-08-11T00:00:00.000Z"),
      updatedBy: "u2",
    }));
    const res = await POST(makePost(validRoom), routeParams);
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      code: "REVISION_CONFLICT",
      currentRevision: 2,
      updatedBy: "u2",
    });
    expect(returningMock).not.toHaveBeenCalled();
  });
});

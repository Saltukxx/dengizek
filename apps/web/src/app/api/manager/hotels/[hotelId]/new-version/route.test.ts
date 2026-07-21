// ---------------------------------------------------------------------------
// POST .../new-version testleri — yalnızca yayındaki tesis taslağa dönebilir
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const requireHotelAccessMock = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireHotelAccess: (...args: unknown[]) => requireHotelAccessMock(...args),
}));

const logAuditMock = vi.fn();
vi.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => logAuditMock(...args),
}));

const selectRowMock = vi.fn();
const returningMock = vi.fn();
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => selectRowMock(),
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
}));

import { POST } from "./route";

const okGuard = {
  user: { id: "u1", email: "y@a.dev", name: "Y", role: "manager" as const },
  hotel: { id: "hotel-1", slug: "aurelia-bay" },
  response: null,
};

const deniedGuard = {
  user: null,
  hotel: null,
  response: NextResponse.json({ ok: false, error: "Bu tesise erişim yetkiniz yok." }, { status: 403 }),
};

function makeParams(hotelId: string) {
  return { params: Promise.resolve({ hotelId }) };
}

beforeEach(() => {
  requireHotelAccessMock.mockReset();
  logAuditMock.mockReset();
  selectRowMock.mockReset();
  returningMock.mockReset();
});

describe("POST /api/manager/hotels/[hotelId]/new-version", () => {
  it("yabancı otel için guard 403'ü aynen döner", async () => {
    requireHotelAccessMock.mockResolvedValue(deniedGuard);
    const res = await POST(new Request("http://localhost", { method: "POST" }), makeParams("baska-otel"));
    expect(res.status).toBe(403);
  });

  it("tesis bulunamazsa 404 döner", async () => {
    requireHotelAccessMock.mockResolvedValue(okGuard);
    selectRowMock.mockResolvedValue([]);
    const res = await POST(new Request("http://localhost", { method: "POST" }), makeParams("aurelia-bay"));
    expect(res.status).toBe(404);
  });

  it("yayında değilse 400 döner", async () => {
    requireHotelAccessMock.mockResolvedValue(okGuard);
    selectRowMock.mockResolvedValue([{ id: "hotel-1", status: "taslak", slug: "aurelia-bay" }]);
    const res = await POST(new Request("http://localhost", { method: "POST" }), makeParams("aurelia-bay"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("yayındaki"),
    });
    expect(returningMock).not.toHaveBeenCalled();
  });

  it("yayındaysa taslağa döner, draftRevision artar ve audit loglanır", async () => {
    requireHotelAccessMock.mockResolvedValue(okGuard);
    selectRowMock.mockResolvedValue([{ id: "hotel-1", status: "yayinda", slug: "aurelia-bay" }]);
    returningMock.mockResolvedValue([{ id: "hotel-1", status: "taslak", draftRevision: 2 }]);
    const res = await POST(new Request("http://localhost", { method: "POST" }), makeParams("aurelia-bay"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      hotel: { status: "taslak", draftRevision: 2 },
    });
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "otel.yeni-surum", entityId: "hotel-1" }),
    );
  });
});

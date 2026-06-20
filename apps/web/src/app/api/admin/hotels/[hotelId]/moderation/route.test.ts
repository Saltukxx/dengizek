// ---------------------------------------------------------------------------
// Admin otel moderasyon route testleri
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const requireAdminMock = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireAdmin: () => requireAdminMock(),
}));

const logAuditMock = vi.fn();
vi.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => logAuditMock(...args),
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => [{ id: "hotel-1", status: "incelemede", slug: "aurelia-bay" }],
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({
          returning: () => [{ status: values.status }],
        }),
      }),
    }),
  }),
  isDbConfigured: () => true,
}));

import { POST } from "./route";

const adminGuard = {
  user: { id: "u-admin", email: "admin@dengizek.dev", name: "Admin", role: "admin" as const },
  response: null,
};

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/hotels/hotel-1/moderation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const routeParams = { params: Promise.resolve({ hotelId: "hotel-1" }) };

beforeEach(() => {
  requireAdminMock.mockReset();
  logAuditMock.mockReset();
});

describe("POST /api/admin/hotels/[hotelId]/moderation", () => {
  it("admin olmayan için guard yanıtını döner", async () => {
    requireAdminMock.mockResolvedValue({
      user: null,
      response: NextResponse.json(
        { ok: false, error: "Bu işlem için yönetici yetkisi gerekli." },
        { status: 403 },
      ),
    });
    const res = await POST(makeRequest({ karar: "onayla" }), routeParams);
    expect(res.status).toBe(403);
  });

  it("notsuz reddetmeyi 400 ile geri çevirir", async () => {
    requireAdminMock.mockResolvedValue(adminGuard);
    const res = await POST(makeRequest({ karar: "reddet" }), routeParams);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(JSON.stringify(json.issues)).toContain("Red nedeni belirtilmelidir.");
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("onaylamada yayinda yapar ve audit yazar", async () => {
    requireAdminMock.mockResolvedValue(adminGuard);
    const res = await POST(makeRequest({ karar: "onayla" }), routeParams);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, status: "yayinda" });
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "otel.onaylandi", entityType: "hotel" }),
    );
  });

  it("notlu reddetmede reddedildi yapar ve audit yazar", async () => {
    requireAdminMock.mockResolvedValue(adminGuard);
    const res = await POST(
      makeRequest({ karar: "reddet", not: "Görseller eksik." }),
      routeParams,
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, status: "reddedildi" });
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "otel.reddedildi",
        meta: expect.objectContaining({ not: "Görseller eksik." }),
      }),
    );
  });
});

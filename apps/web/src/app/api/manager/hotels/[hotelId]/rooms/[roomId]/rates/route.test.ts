// ---------------------------------------------------------------------------
// Dönemsel fiyat route testleri — tenant izolasyonu + doğrulama + senkronizasyon
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const requireHotelAccessMock = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireHotelAccess: (...args: unknown[]) => requireHotelAccessMock(...args),
}));

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

// select sonuçları sırayla döner: önce oda araması, sonra mevcut dönemler...
const selectResults: unknown[][] = [];
const deleteWhereMock = vi.fn();
const insertValuesMock = vi.fn();
const updateWhereMock = vi.fn();

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => {
          const result = selectResults.shift() ?? [];
          return Object.assign([...result], {
            orderBy: () => result,
            limit: () => result,
          });
        },
      }),
    }),
    delete: () => ({ where: (...args: unknown[]) => deleteWhereMock(...args) }),
    insert: () => ({ values: (...args: unknown[]) => insertValuesMock(...args) }),
    update: () => ({
      set: () => ({ where: (...args: unknown[]) => updateWhereMock(...args) }),
    }),
  }),
  isDbConfigured: () => true,
}));

import { GET, PUT } from "./route";

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

const room = { id: "room-1", slug: "seaview-deluxe" };

const validRate = {
  name: "Yaz 2026",
  startDate: "2026-06-01",
  endDate: "2026-09-15",
  priceMinor: 620000,
  currency: "TRY",
  minStayNights: 2,
};

const routeParams = {
  params: Promise.resolve({ hotelId: "hotel-1", roomId: "room-1" }),
};

function makePut(body: unknown) {
  return new Request("http://localhost/api/manager/hotels/x/rooms/y/rates", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireHotelAccessMock.mockReset();
  deleteWhereMock.mockReset();
  insertValuesMock.mockReset();
  updateWhereMock.mockReset();
  selectResults.length = 0;
});

describe("room rates API", () => {
  it("GET yabancı otelde 403 döner (tenant izolasyonu)", async () => {
    requireHotelAccessMock.mockResolvedValue(deniedGuard);
    const res = await GET(new Request("http://localhost"), routeParams);
    expect(res.status).toBe(403);
  });

  it("PUT geçersiz tarihte 400 döner", async () => {
    requireHotelAccessMock.mockResolvedValue(okGuard);
    const res = await PUT(
      makePut({ donemler: [{ ...validRate, startDate: "01.06.2026" }] }),
      routeParams,
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(JSON.stringify(json.issues)).toContain("YYYY-AA-GG");
  });

  it("PUT bitiş < başlangıç olduğunda 400 döner", async () => {
    requireHotelAccessMock.mockResolvedValue(okGuard);
    const res = await PUT(
      makePut({ donemler: [{ ...validRate, endDate: "2026-05-01" }] }),
      routeParams,
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(JSON.stringify(json.issues)).toContain("başlangıçtan önce");
  });

  it("PUT senkronize eder: yeni ekler, listede olmayanı siler", async () => {
    requireHotelAccessMock.mockResolvedValue(okGuard);
    selectResults.push(
      [room], // findRoom
      [{ id: "rate-old" }], // mevcut dönemler
      [], // dönüş listesi
    );
    const res = await PUT(makePut({ donemler: [validRate] }), routeParams);
    expect(res.status).toBe(200);
    expect(deleteWhereMock).toHaveBeenCalledTimes(1); // rate-old silindi
    expect(insertValuesMock).toHaveBeenCalledTimes(1); // yeni dönem eklendi
    expect(updateWhereMock).not.toHaveBeenCalled();
  });

  const rateId = "11111111-1111-4111-8111-111111111111";

  it("PUT id'li kaydı günceller", async () => {
    requireHotelAccessMock.mockResolvedValue(okGuard);
    selectResults.push([room], [{ id: rateId }], []);
    const res = await PUT(
      makePut({ donemler: [{ ...validRate, id: rateId }] }),
      routeParams,
    );
    expect(res.status).toBe(200);
    expect(updateWhereMock).toHaveBeenCalledTimes(1);
    expect(insertValuesMock).not.toHaveBeenCalled();
    expect(deleteWhereMock).not.toHaveBeenCalled();
  });

  it("PUT başka odaya ait id'de 400 döner", async () => {
    requireHotelAccessMock.mockResolvedValue(okGuard);
    selectResults.push([room], [{ id: rateId }]);
    const res = await PUT(
      makePut({
        donemler: [
          { ...validRate, id: "0b6e4a0c-0000-4000-8000-000000000000" },
        ],
      }),
      routeParams,
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Geçersiz dönem");
  });
});

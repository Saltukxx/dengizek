// ---------------------------------------------------------------------------
// POST .../submit testleri
//
// Kritik davranış: YAYINDAKİ tesis de doğrudan incelemeye gönderilebilir.
// Misafir görünürlüğü status'e değil publishedSnapshot'a bağlı olduğundan
// (bkz. @/lib/hotel-visibility) tesis inceleme boyunca canlı kalır — eskiden
// önce "yeni sürüm" ile taslağa alınması gerekiyordu ve tesis yayından
// düşüyordu.
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

vi.mock("@/lib/hotel-content-snapshot", () => ({
  buildHotelContentSnapshot: async () => ({ schemaVersion: 1, hotel: {} }),
}));

const selectRowMock = vi.fn();
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => selectRowMock() }),
      }),
    }),
  }),
}));

/** Transaction gövdesi: kilitli satır okur, günceller, güncellenmiş satırı döner. */
const updatedRowMock = vi.fn();
vi.mock("@/lib/db/transaction", () => ({
  withTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      select: () => ({
        from: () => ({ where: () => ({ for: () => selectRowMock() }) }),
      }),
      update: () => ({
        set: () => ({ where: () => ({ returning: () => updatedRowMock() }) }),
      }),
    }),
}));

import { POST } from "./route";

const okGuard = {
  user: { id: "u1", email: "y@a.dev", name: "Y", role: "manager" as const, tokenVersion: 1 },
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

/** Tek satırlık select sonucu — route her iki okumada da bunu görür. */
function hotelRow(overrides: Record<string, unknown>) {
  return [{ id: "hotel-1", status: "taslak", draftRevision: 3, submittedRevision: null, ...overrides }];
}

beforeEach(() => {
  requireHotelAccessMock.mockReset();
  logAuditMock.mockReset();
  selectRowMock.mockReset();
  updatedRowMock.mockReset();
  requireHotelAccessMock.mockResolvedValue(okGuard);
  updatedRowMock.mockResolvedValue([{ status: "incelemede", submittedRevision: 3 }]);
});

describe("POST /api/manager/hotels/[hotelId]/submit", () => {
  it("yetkisiz kullanıcıyı reddeder", async () => {
    requireHotelAccessMock.mockResolvedValue(deniedGuard);
    const res = await POST(new Request("http://x"), makeParams("hotel-1"));
    expect(res.status).toBe(403);
  });

  it("taslak tesisi incelemeye gönderir", async () => {
    selectRowMock.mockResolvedValue(hotelRow({ status: "taslak" }));
    const res = await POST(new Request("http://x"), makeParams("hotel-1"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, status: "incelemede" });
  });

  it("YAYINDAKİ tesisi de gönderir — tesis inceleme boyunca canlı kalır", async () => {
    selectRowMock.mockResolvedValue(
      hotelRow({ status: "yayinda", publishedRevision: 2, draftRevision: 3 }),
    );
    const res = await POST(new Request("http://x"), makeParams("hotel-1"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, status: "incelemede" });
  });

  it("reddedilmiş tesisi tekrar gönderir", async () => {
    selectRowMock.mockResolvedValue(hotelRow({ status: "reddedildi" }));
    const res = await POST(new Request("http://x"), makeParams("hotel-1"));
    expect(res.status).toBe(200);
  });

  it("bekleyen ve güncel gönderim varsa 409 döner", async () => {
    selectRowMock.mockResolvedValue(
      hotelRow({ status: "incelemede", draftRevision: 3, submittedRevision: 3 }),
    );
    const res = await POST(new Request("http://x"), makeParams("hotel-1"));
    expect(res.status).toBe(409);
  });

  it("gönderim bayatsa (taslak sonradan değişti) yeniden göndermeye izin verir", async () => {
    selectRowMock.mockResolvedValue(
      hotelRow({ status: "incelemede", draftRevision: 5, submittedRevision: 3 }),
    );
    const res = await POST(new Request("http://x"), makeParams("hotel-1"));
    expect(res.status).toBe(200);
  });

  it("tesis bulunamazsa 404 döner", async () => {
    selectRowMock.mockResolvedValue([]);
    const res = await POST(new Request("http://x"), makeParams("hotel-1"));
    expect(res.status).toBe(404);
  });
});

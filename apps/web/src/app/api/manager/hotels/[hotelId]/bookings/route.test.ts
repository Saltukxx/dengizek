import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { bookingsTable } from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({
  requireHotelAccess: vi.fn(),
  getDb: vi.fn(),
  createPendingBooking: vi.fn(),
  approveBooking: vi.fn(),
  releaseApprovedBooking: vi.fn(),
  reopenBooking: vi.fn(),
  logAudit: vi.fn(),
  paginatedQuery: vi.fn(),
  assertRoomsBelongToHotel: vi.fn(),
  assertRatePlanBelongsToHotel: vi.fn(),
  assertInquiryBelongsToHotel: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireHotelAccess: mocks.requireHotelAccess }));
vi.mock("@/lib/db", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/pagination", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pagination")>("@/lib/pagination");
  return { ...actual, paginatedQuery: mocks.paginatedQuery };
});
vi.mock("@/lib/tenant-integrity", () => ({
  assertRoomsBelongToHotel: mocks.assertRoomsBelongToHotel,
  assertRatePlanBelongsToHotel: mocks.assertRatePlanBelongsToHotel,
  assertInquiryBelongsToHotel: mocks.assertInquiryBelongsToHotel,
}));
vi.mock("@/lib/bookings", async () => {
  const actual = await vi.importActual<typeof import("@/lib/bookings")>("@/lib/bookings");
  return {
    ...actual,
    createPendingBooking: mocks.createPendingBooking,
    approveBooking: mocks.approveBooking,
    releaseApprovedBooking: mocks.releaseApprovedBooking,
    reopenBooking: mocks.reopenBooking,
  };
});

import { BookingServiceError } from "@/lib/bookings";
import { GET, PATCH, POST } from "./route";

const hotelId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const bookingId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const roomId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ratePlanId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const inquiryId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const routeParams = { params: Promise.resolve({ hotelId: "hotel-route" }) };

const guard = {
  response: null,
  hotel: { id: hotelId, slug: "kar-zirvesi" },
  user: { id: "manager-1", role: "manager" },
};

function jsonRequest(method: "POST" | "PATCH", body: unknown) {
  return new Request("http://localhost/api/manager/hotels/hotel-route/bookings", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBooking = {
  roomId,
  ratePlanId,
  inquiryId,
  guestName: "Ada Yılmaz",
  guestEmail: "ada@example.com",
  checkIn: "2026-12-10",
  checkOut: "2026-12-13",
  adults: 2,
  children: 0,
  notes: "Geç giriş",
};

function makeDb(selectRows: unknown[][] = [], updatedRow: unknown = { id: bookingId }) {
  const queue = [...selectRows];
  const setValues = vi.fn();
  const whereConditions: unknown[] = [];
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn((condition: unknown) => {
          whereConditions.push(condition);
          return { limit: vi.fn(async () => queue.shift() ?? []) };
        }),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => {
        setValues(values);
        return {
          where: vi.fn((condition: unknown) => {
            whereConditions.push(condition);
            return { returning: vi.fn(async () => [updatedRow]) };
          }),
        };
      }),
    })),
  };
  mocks.getDb.mockReturnValue(db);
  return { db, setValues, whereConditions };
}

describe("manager bookings API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireHotelAccess.mockResolvedValue(guard);
    mocks.assertRoomsBelongToHotel.mockResolvedValue(true);
    mocks.assertRatePlanBelongsToHotel.mockResolvedValue(true);
    mocks.assertInquiryBelongsToHotel.mockResolvedValue(true);
    mocks.paginatedQuery.mockResolvedValue({
      items: [{ id: bookingId }],
      sayfa: 2,
      limit: 10,
      totalCount: 11,
      hasMore: false,
    });
  });

  it("GET tenant ve durum koşullarını pagination sorgusuna geçirir", async () => {
    makeDb();
    const res = await GET(
      new Request("http://localhost/api/bookings?durum=onaylandi&sayfa=2&limit=10"),
      routeParams,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      bookings: [{ id: bookingId }],
      sayfa: 2,
      totalCount: 11,
    });
    expect(mocks.requireHotelAccess).toHaveBeenCalledWith("hotel-route");
    const where = mocks.paginatedQuery.mock.calls[0][0].where;
    const query = drizzle({} as never).select().from(bookingsTable).where(where).toSQL();
    expect(query.sql).toContain('"hotel_id" =');
    expect(query.sql).toContain('"status" =');
    expect(query.params).toEqual(expect.arrayContaining([hotelId, "onaylandi"]));
    expect(mocks.paginatedQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        pagination: expect.objectContaining({ sayfa: 2, limit: 10, offset: 10 }),
      }),
    );
  });

  it("POST geçersiz tarihte tenant referanslarına veya servise dokunmaz", async () => {
    const res = await POST(
      jsonRequest("POST", { ...validBooking, checkOut: "2026-12-09" }),
      routeParams,
    );

    expect(res.status).toBe(400);
    expect(mocks.assertRoomsBelongToHotel).not.toHaveBeenCalled();
    expect(mocks.createPendingBooking).not.toHaveBeenCalled();
  });

  it("POST oda, fiyat planı ve talep referanslarını aynı tenant içinde doğrular", async () => {
    mocks.createPendingBooking.mockResolvedValue({ id: bookingId, status: "beklemede" });

    const res = await POST(jsonRequest("POST", validBooking), routeParams);

    expect(res.status).toBe(201);
    expect(mocks.assertRoomsBelongToHotel).toHaveBeenCalledWith(hotelId, [roomId]);
    expect(mocks.assertRatePlanBelongsToHotel).toHaveBeenCalledWith(hotelId, ratePlanId);
    expect(mocks.assertInquiryBelongsToHotel).toHaveBeenCalledWith(hotelId, inquiryId);
    expect(mocks.createPendingBooking).toHaveBeenCalledWith(
      hotelId,
      expect.objectContaining({ roomId, guestEmail: "ada@example.com", currency: "TRY" }),
    );
  });

  it("POST ilişkili kayıtlardan biri yabancı tenant'a aitse rezervasyon oluşturmaz", async () => {
    mocks.assertRatePlanBelongsToHotel.mockResolvedValue(false);

    const res = await POST(jsonRequest("POST", validBooking), routeParams);

    expect(res.status).toBe(404);
    expect(mocks.createPendingBooking).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", 404],
    ["invalid_state", 400],
    ["overlap", 409],
    ["inventory", 409],
  ] as const)("POST servis %s hatasını %i sözleşmesine çevirir", async (code, status) => {
    mocks.createPendingBooking.mockRejectedValue(new BookingServiceError("service failure", code));

    const res = await POST(jsonRequest("POST", validBooking), routeParams);

    expect(res.status).toBe(status);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "service failure" });
  });

  it("PATCH durum değişikliğinde idempotency anahtarı yoksa servisi çağırmaz", async () => {
    const res = await PATCH(
      jsonRequest("PATCH", { id: bookingId, action: "approve" }),
      routeParams,
    );

    expect(res.status).toBe(400);
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.approveBooking).not.toHaveBeenCalled();
  });

  it("PATCH rezervasyonu tenant koşuluyla bulur ve onayı audit kaydına bağlar", async () => {
    const { whereConditions } = makeDb([[{ id: bookingId, totalMinor: null }]]);
    mocks.approveBooking.mockResolvedValue({ id: bookingId, status: "onaylandi" });

    const res = await PATCH(
      jsonRequest("PATCH", { id: bookingId, action: "approve", idempotencyKey: "approve-once" }),
      routeParams,
    );

    expect(res.status).toBe(200);
    expect(mocks.approveBooking).toHaveBeenCalledWith(hotelId, bookingId, "approve-once");
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: guard.user,
        action: "rezervasyon.onaylandi",
        entityId: bookingId,
        meta: { hotelId },
      }),
    );
    const query = drizzle({} as never)
      .select()
      .from(bookingsTable)
      .where(whereConditions[0] as never)
      .toSQL();
    expect(query.params).toEqual(expect.arrayContaining([bookingId, hotelId]));
  });

  it("PATCH iptal ve no-show işlemlerini doğru hedef duruma çevirir", async () => {
    makeDb([
      [{ id: bookingId, totalMinor: null }],
      [{ id: bookingId, totalMinor: null }],
    ]);
    mocks.releaseApprovedBooking.mockResolvedValue({ id: bookingId });

    const cancel = await PATCH(
      jsonRequest("PATCH", { id: bookingId, action: "cancel", idempotencyKey: "cancel-once" }),
      routeParams,
    );
    const noShow = await PATCH(
      jsonRequest("PATCH", { id: bookingId, action: "mark_no_show", idempotencyKey: "noshow-once" }),
      routeParams,
    );

    expect(cancel.status).toBe(200);
    expect(noShow.status).toBe(200);
    expect(mocks.releaseApprovedBooking).toHaveBeenNthCalledWith(
      1, hotelId, bookingId, "iptal", "cancel-once",
    );
    expect(mocks.releaseApprovedBooking).toHaveBeenNthCalledWith(
      2, hotelId, bookingId, "no_show", "noshow-once",
    );
  });

  it("PATCH alan güncellemesini yalnızca rezervasyon ve otel kimliği birlikte eşleşince yapar", async () => {
    const updated = { id: bookingId, notes: "Yeni not" };
    const { setValues, whereConditions } = makeDb([[{ id: bookingId, totalMinor: null }]], updated);

    const res = await PATCH(jsonRequest("PATCH", { id: bookingId, notes: "Yeni not" }), routeParams);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ booking: updated });
    expect(setValues).toHaveBeenCalledWith({ notes: "Yeni not", updatedAt: expect.any(Date) });
    const updateWhere = whereConditions.at(-1);
    const query = drizzle({} as never)
      .select()
      .from(bookingsTable)
      .where(updateWhere as never)
      .toSQL();
    expect(query.params).toEqual(expect.arrayContaining([bookingId, hotelId]));
  });
});

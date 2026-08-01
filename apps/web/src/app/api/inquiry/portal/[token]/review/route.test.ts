// ---------------------------------------------------------------------------
// Misafir yorum portalı testleri
//
// Kritik davranışlar: kimlik token'dan gelir (istemci otel/ad seçemez),
// talep başına tek yorum, yorum "beklemede" başlar ve "verified_guest"
// olarak etiketlenir.
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type Table } from "drizzle-orm";

const rows = { inquiries: [] as Record<string, unknown>[], reviews: [] as Record<string, unknown>[] };
const insertedValues = vi.fn();
const notifyMock = vi.fn();

vi.mock("@/lib/notifications", () => ({
  notifyHotelMembers: (...args: unknown[]) => notifyMock(...args),
}));

const rateLimitOk = vi.fn<() => Promise<boolean>>();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => rateLimitOk(),
  requestIp: () => "1.2.3.4",
}));

vi.mock("@/lib/db", () => ({
  isDbConfigured: () => true,
  getDb: () => ({
    select: () => ({
      from: (table: Table) => ({
        where: () => ({
          limit: async () =>
            getTableName(table) === "inquiries" ? rows.inquiries : rows.reviews,
        }),
      }),
    }),
    insert: () => ({
      values: (v: unknown) => ({
        returning: async () => {
          insertedValues(v);
          return [{ id: "rev-1", ...(v as object) }];
        },
      }),
    }),
  }),
}));

import { GET, POST } from "./route";

const inquiry = {
  id: "inq-1",
  hotelId: "hotel-1",
  name: "Ada Lovelace",
  checkIn: "2026-08-01",
  accessTokenRevokedAt: null,
  accessTokenExpiresAt: new Date(Date.now() + 86_400_000),
};

function makeParams(token = "tok") {
  return { params: Promise.resolve({ token }) };
}

function postReq(body: unknown) {
  return new Request("http://x", { method: "POST", body: JSON.stringify(body) });
}

const validBody = { rating: 5, title: "Harika", body: "Çok memnun kaldık." };

beforeEach(() => {
  rows.inquiries = [{ ...inquiry }];
  rows.reviews = [];
  insertedValues.mockReset();
  notifyMock.mockReset();
  rateLimitOk.mockReset();
  rateLimitOk.mockResolvedValue(true);
});

describe("POST /api/inquiry/portal/[token]/review", () => {
  it("geçerli token ile yorumu beklemede kaydeder", async () => {
    const res = await POST(postReq(validBody), makeParams());
    expect(res.status).toBe(201);
    expect(insertedValues).toHaveBeenCalledWith(
      expect.objectContaining({
        hotelId: "hotel-1",
        inquiryId: "inq-1",
        status: "beklemede",
        source: "verified_guest",
        rating: 5,
      }),
    );
  });

  it("misafir adını talep kaydından alır — istemci değiştiremez", async () => {
    await POST(postReq({ ...validBody, guestName: "Sahte İsim", hotelId: "baska-otel" }), makeParams());
    expect(insertedValues).toHaveBeenCalledWith(
      expect.objectContaining({ guestName: "Ada Lovelace", hotelId: "hotel-1" }),
    );
  });

  it("stayDate verilmezse talebin giriş tarihine düşer", async () => {
    await POST(postReq(validBody), makeParams());
    expect(insertedValues).toHaveBeenCalledWith(
      expect.objectContaining({ stayDate: "2026-08-01" }),
    );
  });

  it("otele bildirim gönderir", async () => {
    await POST(postReq(validBody), makeParams());
    expect(notifyMock).toHaveBeenCalledWith("hotel-1", expect.objectContaining({ type: "yorum" }));
  });

  it("geçersiz token'da 404 döner", async () => {
    rows.inquiries = [];
    const res = await POST(postReq(validBody), makeParams());
    expect(res.status).toBe(404);
  });

  it("süresi dolmuş token'da 404 döner", async () => {
    rows.inquiries = [{ ...inquiry, accessTokenExpiresAt: new Date(Date.now() - 1000) }];
    const res = await POST(postReq(validBody), makeParams());
    expect(res.status).toBe(404);
  });

  it("iptal edilmiş token'da 404 döner", async () => {
    rows.inquiries = [{ ...inquiry, accessTokenRevokedAt: new Date() }];
    const res = await POST(postReq(validBody), makeParams());
    expect(res.status).toBe(404);
  });

  it("talep başına ikinci yorumu 409 ile reddeder", async () => {
    rows.reviews = [{ id: "rev-0", rating: 4, status: "yayinda" }];
    const res = await POST(postReq(validBody), makeParams());
    expect(res.status).toBe(409);
    expect(insertedValues).not.toHaveBeenCalled();
  });

  it("otele bağlı olmayan talepte 409 döner", async () => {
    rows.inquiries = [{ ...inquiry, hotelId: null }];
    const res = await POST(postReq(validBody), makeParams());
    expect(res.status).toBe(409);
  });

  it("geçersiz puanı reddeder", async () => {
    const res = await POST(postReq({ ...validBody, rating: 9 }), makeParams());
    expect(res.status).toBe(400);
  });

  it("boş yorum metnini reddeder", async () => {
    const res = await POST(postReq({ rating: 5, body: "" }), makeParams());
    expect(res.status).toBe(400);
  });

  it("hız limiti aşılırsa 429 döner", async () => {
    rateLimitOk.mockResolvedValue(false);
    const res = await POST(postReq(validBody), makeParams());
    expect(res.status).toBe(429);
  });
});

describe("GET /api/inquiry/portal/[token]/review", () => {
  it("yorum yoksa null döner", async () => {
    const res = await GET(new Request("http://x"), makeParams());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ review: null, canReview: true });
  });

  it("mevcut yorumu döner", async () => {
    rows.reviews = [{ id: "rev-0", rating: 4, status: "beklemede" }];
    const res = await GET(new Request("http://x"), makeParams());
    await expect(res.json()).resolves.toMatchObject({ review: { id: "rev-0" } });
  });

  it("geçersiz token'da 404 döner", async () => {
    rows.inquiries = [];
    const res = await GET(new Request("http://x"), makeParams());
    expect(res.status).toBe(404);
  });
});

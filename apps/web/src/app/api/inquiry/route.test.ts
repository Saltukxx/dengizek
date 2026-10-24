import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  requestIp: vi.fn(),
  trackEvent: vi.fn(),
  notifyHotelMembers: vi.fn(),
  sendEmail: vi.fn(),
  isDbConfigured: vi.fn(),
  getDb: vi.fn(),
  generatePortalToken: vi.fn(),
  hashPortalToken: vi.fn(),
  portalTokenExpiry: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  requestIp: mocks.requestIp,
}));
vi.mock("@/lib/analytics", () => ({ trackEvent: mocks.trackEvent }));
vi.mock("@/lib/notifications", () => ({ notifyHotelMembers: mocks.notifyHotelMembers }));
vi.mock("@/lib/email", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/lib/db", () => ({
  isDbConfigured: mocks.isDbConfigured,
  getDb: mocks.getDb,
}));
vi.mock("@/lib/inquiry-portal-token", () => ({
  generatePortalToken: mocks.generatePortalToken,
  hashPortalToken: mocks.hashPortalToken,
  portalTokenExpiry: mocks.portalTokenExpiry,
}));

import { POST } from "./route";

const baseBody = {
  name: "Ada Yılmaz",
  email: "ada@example.com",
  phone: "+90 555 000 00 00",
  message: "Dağ manzaralı oda için bilgi almak istiyorum.",
  marketingConsent: false,
  hotelSlug: "kar-zirvesi",
  roomSlug: "dag-suiti",
  checkIn: "2026-12-10",
  checkOut: "2026-12-13",
  adults: 2,
  children: 1,
  source: "tour_player",
  locale: "tr",
};

function request(body: unknown = baseBody) {
  return new Request("http://localhost/api/inquiry", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.4" },
    body: JSON.stringify(body),
  });
}

function queryResult(rows: unknown[]) {
  return { limit: vi.fn(async () => rows) };
}

function makeDb(
  selectRows: unknown[][],
  insertionOutcomes: Array<Record<string, unknown> | Error> = [{ id: "inquiry-1" }],
) {
  const selectQueue = [...selectRows];
  const outcomeQueue = [...insertionOutcomes];
  const insertedValues: Record<string, unknown>[] = [];
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => queryResult(selectQueue.shift() ?? [])),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => {
        insertedValues.push(values);
        return {
          returning: vi.fn(async () => {
            const outcome = outcomeQueue.shift() ?? { id: "inquiry-fallback" };
            if (outcome instanceof Error) throw outcome;
            return [outcome];
          }),
        };
      }),
    })),
  };
  mocks.getDb.mockReturnValue(db);
  return { db, insertedValues };
}

describe("public inquiry API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("USE_MOCK_DATA", "false");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://dengizek.test");
    mocks.requestIp.mockReturnValue("198.51.100.4");
    mocks.checkRateLimit.mockResolvedValue(true);
    mocks.isDbConfigured.mockReturnValue(true);
    mocks.generatePortalToken.mockReturnValue("portal-secret");
    mocks.hashPortalToken.mockImplementation((token: string) => `hash:${token}`);
    mocks.portalTokenExpiry.mockReturnValue(new Date("2027-03-10T00:00:00.000Z"));
    mocks.sendEmail.mockResolvedValue("queued");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("talep gönderimini IP başına dakikada 5 ile sınırlar", async () => {
    mocks.checkRateLimit.mockResolvedValue(false);

    const res = await POST(request());

    expect(res.status).toBe(429);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("198.51.100.4", {
      name: "inquiry",
      windowMs: 60_000,
      limit: 5,
    });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("geçersiz e-posta ve tarihleri hiçbir yan etki oluşturmadan reddeder", async () => {
    const res = await POST(request({
      ...baseBody,
      email: "yanlis",
      checkOut: "2026-12-09",
    }));

    expect(res.status).toBe(400);
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.notifyHotelMembers).not.toHaveBeenCalled();
  });

  it("kalıcı kayıt yapılandırılmamışsa üretim benzeri modda 503 döner", async () => {
    mocks.isDbConfigured.mockReturnValue(false);

    const res = await POST(request());

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ code: "service_unavailable" });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("görünür olmayan tesise talep veya bildirim oluşturmaz", async () => {
    const { db } = makeDb([[]]);

    const res = await POST(request());

    expect(res.status).toBe(404);
    expect(db.insert).not.toHaveBeenCalled();
    expect(mocks.notifyHotelMembers).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("başka tesise ait oda slug'ını kabul etmez", async () => {
    const { db } = makeDb([[{ id: "hotel-db" }], []]);

    const res = await POST(request());

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "Seçilen oda tipi bu otel için geçerli değil.",
    });
    expect(db.insert).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("portal anahtarının yalnızca hash'ini saklar ve doğru yan etkileri üretir", async () => {
    const { insertedValues } = makeDb(
      [[{ id: "hotel-db" }], [{ id: "room-db", slug: "dag-suiti" }]],
      [{ id: "inquiry-1" }],
    );

    const res = await POST(request({ ...baseBody, tourId: "tour-1", stepKey: "spa" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      id: "inquiry-1",
      emailSent: false,
      emailStatus: "queued",
    });
    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]).toMatchObject({
      hotelId: "hotel-db",
      hotelSlug: "kar-zirvesi",
      roomId: "room-db",
      roomSlug: "dag-suiti",
      checkIn: "2026-12-10",
      checkOut: "2026-12-13",
      accessTokenHash: "hash:portal-secret",
      accessTokenExpiresAt: new Date("2027-03-10T00:00:00.000Z"),
      // Telefon gönderilse de saklanmaz: yazışma yalnız portaldan yürür.
      phone: null,
    });
    expect(JSON.stringify(insertedValues[0])).not.toContain('"accessToken":"portal-secret"');
    expect(mocks.trackEvent).toHaveBeenCalledWith(
      "inquiry_submit",
      expect.objectContaining({ inquiryId: "inquiry-1", roomSlug: "dag-suiti" }),
      "hotel-db",
      "kar-zirvesi",
    );
    expect(mocks.notifyHotelMembers).toHaveBeenCalledWith(
      "hotel-db",
      expect.objectContaining({ type: "talep", link: "/dashboard/inquiries" }),
    );
    expect(mocks.sendEmail).toHaveBeenCalledWith({
      to: "ada@example.com",
      subject: "Talebiniz alındı — Otelsayfam",
      text: expect.stringContaining("https://dengizek.test/inquiry/portal/portal-secret"),
    });
  });

  it("e-posta sağlayıcısı yoksa talebi kaydeder ama teslim edilmiş gibi raporlamaz", async () => {
    mocks.sendEmail.mockResolvedValue("unavailable");
    makeDb([[{ id: "hotel-db" }], [{ id: "room-db", slug: "dag-suiti" }]]);

    const res = await POST(request());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      emailSent: false,
      emailStatus: "unavailable",
    });
  });

  it("portal token hash çakışmasında yeni token ile sınırlı sayıda tekrar dener", async () => {
    mocks.generatePortalToken
      .mockReturnValueOnce("duplicate-token")
      .mockReturnValueOnce("fresh-token");
    const { insertedValues } = makeDb(
      [[{ id: "hotel-db" }], [{ id: "room-db", slug: "dag-suiti" }]],
      [new Error("duplicate key violates unique constraint"), { id: "inquiry-2" }],
    );

    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(insertedValues).toHaveLength(2);
    expect(insertedValues.map((v) => v.accessTokenHash)).toEqual([
      "hash:duplicate-token",
      "hash:fresh-token",
    ]);
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining("/fresh-token") }),
    );
  });

  it("otel seçilmemişse gelen oda slug'ını tenant dışı referans olarak saklamaz", async () => {
    const { insertedValues } = makeDb([]);

    const res = await POST(request({ ...baseBody, hotelSlug: undefined }));

    expect(res.status).toBe(200);
    expect(insertedValues[0]).toMatchObject({ hotelId: null, roomId: null, roomSlug: null });
    expect(mocks.notifyHotelMembers).not.toHaveBeenCalled();
  });

  it("ad ve mesajdaki iletişim bilgisini tesise gitmeden maskeler", async () => {
    const { insertedValues } = makeDb([[{ id: "hotel-db" }]], [{ id: "inquiry-2" }]);

    const res = await POST(
      request({
        ...baseBody,
        roomSlug: undefined,
        name: "Ada 0532 123 45 67",
        message: "Beni arayın: 0532 123 45 67 ya da ada.ozel@example.org. 10.12.2026 girişi için.",
      }),
    );

    expect(res.status).toBe(200);
    const stored = insertedValues[0] as { name: string; message: string; email: string };
    expect(stored.name).not.toContain("0532");
    expect(stored.message).not.toContain("0532");
    expect(stored.message).not.toContain("example.org");
    expect(stored.message).toContain("10.12.2026");
    // Bildirim gövdesi de maskelenmiş metinden üretilir.
    expect(JSON.stringify(mocks.notifyHotelMembers.mock.calls)).not.toContain("0532");
    // Misafirin e-postası platformda kalır (portal bağlantısı oraya gider).
    expect(stored.email).toBe("ada@example.com");
  });
});


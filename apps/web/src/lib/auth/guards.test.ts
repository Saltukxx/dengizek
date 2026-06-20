// ---------------------------------------------------------------------------
// Guard testleri — admin/manager/yabancı senaryoları
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@/auth", () => ({
  auth: () => authMock(),
}));

// Drizzle sorgu zinciri taklidi: select().from().where().limit() → satırlar
const limitMock = vi.fn();
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: (...args: unknown[]) => limitMock(...args),
        }),
      }),
    }),
  }),
  isDbConfigured: () => true,
}));

import { requireAdmin, requireHotelAccess, requireUser } from "./guards";

const adminSession = {
  user: { id: "u-admin", email: "admin@dengizek.dev", name: "Admin", role: "admin" },
};
const managerSession = {
  user: { id: "u-manager", email: "yonetici@aurelia.dev", name: "Yonetici", role: "manager" },
};

beforeEach(() => {
  authMock.mockReset();
  limitMock.mockReset();
});

describe("requireUser", () => {
  it("oturum yoksa 401 döner", async () => {
    authMock.mockResolvedValue(null);
    const result = await requireUser();
    expect(result.user).toBeNull();
    expect(result.response?.status).toBe(401);
    await expect(result.response!.json()).resolves.toMatchObject({
      ok: false,
      error: "Oturum açmanız gerekiyor.",
    });
  });

  it("oturum varsa kullanıcıyı döner", async () => {
    authMock.mockResolvedValue(managerSession);
    const result = await requireUser();
    expect(result.response).toBeNull();
    expect(result.user?.id).toBe("u-manager");
  });
});

describe("requireAdmin", () => {
  it("manager için 403 döner", async () => {
    authMock.mockResolvedValue(managerSession);
    const result = await requireAdmin();
    expect(result.user).toBeNull();
    expect(result.response?.status).toBe(403);
  });

  it("admin için kullanıcıyı döner", async () => {
    authMock.mockResolvedValue(adminSession);
    const result = await requireAdmin();
    expect(result.response).toBeNull();
    expect(result.user?.role).toBe("admin");
  });
});

describe("requireHotelAccess", () => {
  const hotelRow = { id: "11111111-1111-1111-1111-111111111111", slug: "aurelia-bay" };

  it("admin üyelik olmadan her otele erişir", async () => {
    authMock.mockResolvedValue(adminSession);
    limitMock.mockResolvedValueOnce([hotelRow]); // otel sorgusu
    const result = await requireHotelAccess("aurelia-bay");
    expect(result.response).toBeNull();
    expect(result.hotel?.slug).toBe("aurelia-bay");
  });

  it("üyeliği olmayan manager için 403 döner (tenant izolasyonu)", async () => {
    authMock.mockResolvedValue(managerSession);
    limitMock
      .mockResolvedValueOnce([hotelRow]) // otel bulunur
      .mockResolvedValueOnce([]); // üyelik yok
    const result = await requireHotelAccess("aurelia-bay");
    expect(result.user).toBeNull();
    expect(result.response?.status).toBe(403);
    await expect(result.response!.json()).resolves.toMatchObject({
      error: "Bu tesise erişim yetkiniz yok.",
    });
  });

  it("editor üyeliği owner gerektiren işlemde reddedilir", async () => {
    authMock.mockResolvedValue(managerSession);
    limitMock
      .mockResolvedValueOnce([hotelRow])
      .mockResolvedValueOnce([{ role: "editor" }]);
    const result = await requireHotelAccess("aurelia-bay", "owner");
    expect(result.response?.status).toBe(403);
  });

  it("owner üyeliği owner gerektiren işlemde kabul edilir", async () => {
    authMock.mockResolvedValue(managerSession);
    limitMock
      .mockResolvedValueOnce([hotelRow])
      .mockResolvedValueOnce([{ role: "owner" }]);
    const result = await requireHotelAccess("aurelia-bay", "owner");
    expect(result.response).toBeNull();
    expect(result.user?.id).toBe("u-manager");
  });

  it("otel bulunamazsa bilgi sızdırmadan 403 döner", async () => {
    authMock.mockResolvedValue(managerSession);
    limitMock.mockResolvedValueOnce([]);
    const result = await requireHotelAccess("olmayan-otel");
    expect(result.response?.status).toBe(403);
  });
});

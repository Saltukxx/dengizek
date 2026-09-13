import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { hotelsTable } from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({
  isDbConfigured: vi.fn(),
  getDb: vi.fn(),
  whereConditions: [] as unknown[],
}));

vi.mock("@/lib/db", () => ({
  isDbConfigured: mocks.isDbConfigured,
  getDb: mocks.getDb,
}));

import { GET } from "./route";

function makeDb(hotelRows: unknown[], inventoryRows: unknown[] = []) {
  let queryIndex = 0;
  const db = {
    select: vi.fn(() => {
      const index = queryIndex++;
      return {
        from: vi.fn(() => ({
          where: vi.fn((condition: unknown) => {
            mocks.whereConditions.push(condition);
            if (index === 0) return { limit: vi.fn(async () => hotelRows) };
            return { orderBy: vi.fn(async () => inventoryRows) };
          }),
          innerJoin: vi.fn(() => ({
            where: vi.fn((condition: unknown) => {
              mocks.whereConditions.push(condition);
              return { orderBy: vi.fn(async () => inventoryRows) };
            }),
          })),
        })),
      };
    }),
  };
  mocks.getDb.mockReturnValue(db);
  return db;
}

const params = { params: Promise.resolve({ slug: "kar-zirvesi" }) };

describe("public availability summary API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.whereConditions.length = 0;
    mocks.isDbConfigured.mockReturnValue(true);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T10:00:00+03:00"));
  });

  afterEach(() => vi.useRealTimers());

  it("DB yapılandırılmamışsa güvenli boş özet döner", async () => {
    mocks.isDbConfigured.mockReturnValue(false);

    const res = await GET(new Request("http://localhost"), params);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, days: [], hasLowInventory: false });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("taslak veya askıdaki oteli görünürlük filtresi üzerinden 404 yapar", async () => {
    makeDb([]);

    const res = await GET(new Request("http://localhost"), params);

    expect(res.status).toBe(404);
    const visibilityWhere = mocks.whereConditions[0];
    const query = drizzle({} as never).select().from(hotelsTable).where(visibilityWhere as never).toSQL();
    expect(query.sql).toContain('"slug" =');
    expect(query.sql).toContain('"published_snapshot" is not null');
    expect(query.sql).toContain('"suspended_at" is null');
    expect(query.params).toContain("kar-zirvesi");
  });

  it("yalnızca stop-sell veya kritik düşük envanter günlerini döndürür", async () => {
    makeDb([{ id: "hotel-db" }], [
      { date: "2026-01-15", roomName: "Dağ Süiti", allotment: 0, stopSell: false },
      { date: "2026-01-16", roomName: "Dağ Süiti", allotment: 1, stopSell: false },
      { date: "2026-01-17", roomName: "Standart", allotment: 4, stopSell: false },
      { date: "2026-01-18", roomName: "Standart", allotment: 8, stopSell: true },
    ]);

    const res = await GET(new Request("http://localhost"), params);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      from: "2026-01-15",
      to: "2026-01-28",
      hasLowInventory: true,
      days: [
        { date: "2026-01-15", roomName: "Dağ Süiti", allotment: 0, stopSell: false },
        { date: "2026-01-16", roomName: "Dağ Süiti", allotment: 1, stopSell: false },
        { date: "2026-01-18", roomName: "Standart", allotment: 8, stopSell: true },
      ],
    });
  });

  it("kritik gün yoksa 14 günlük aralığı koruyup hasLowInventory=false döner", async () => {
    makeDb([{ id: "hotel-db" }], [
      { date: "2026-01-20", roomName: "Standart", allotment: 2, stopSell: false },
    ]);

    const res = await GET(new Request("http://localhost"), params);

    await expect(res.json()).resolves.toMatchObject({
      from: "2026-01-15",
      to: "2026-01-28",
      days: [],
      hasLowInventory: false,
    });
  });
});

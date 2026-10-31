import { beforeEach, describe, expect, it, vi } from "vitest";

const requireHotelAccessMock = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireHotelAccess: (...args: unknown[]) => requireHotelAccessMock(...args),
}));

let row: { aiFacts: string[]; draftRevision: number } | null = null;
const updates: Array<Record<string, unknown>> = [];
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve(row ? [row] : []) }) }) }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({
          returning: () => {
            updates.push(values);
            return Promise.resolve([{ draftRevision: (row?.draftRevision ?? 0) + 1 }]);
          },
        }),
      }),
    }),
  }),
}));

import { POST } from "./route";

const params = { params: Promise.resolve({ hotelId: "hotel-1" }) };
const post = (body: unknown) =>
  POST(new Request("http://x/api", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }), params);

beforeEach(() => {
  updates.length = 0;
  row = { aiFacts: ["Deniz manzarası eşsizdir."], draftRevision: 4 };
  requireHotelAccessMock.mockResolvedValue({ user: { id: "u1" }, hotel: { id: "hotel-1", slug: "x" }, response: null });
});

describe("POST ai-answers", () => {
  it("cevap taslaktaki otel ifadelerine eklenir", async () => {
    const res = await post({ question: "Kese var mı?", answer: "Evet, hamamda ücretli kese var." });
    expect(res.status).toBe(200);
    expect(updates[0]?.aiFacts).toEqual(["Deniz manzarası eşsizdir.", "Kese var mı? — Evet, hamamda ücretli kese var."]);
  });

  it("aynı sorunun eski cevabı değişir", async () => {
    row = { aiFacts: ["Kese var mı? — Hayır.", "Deniz manzarası eşsizdir."], draftRevision: 4 };
    await post({ question: "kese var mi", answer: "Evet, artık var." });
    expect(updates[0]?.aiFacts).toEqual(["Deniz manzarası eşsizdir.", "kese var mi? — Evet, artık var."]);
  });

  it("iletişim bilgisi içeren cevap reddedilir", async () => {
    const res = await post({ question: "Transfer var mı?", answer: "Bizi 0532 123 45 67'den arayın." });
    expect(res.status).toBe(400);
    expect(updates).toHaveLength(0);
  });

  it("boş cevap ve yetkisiz erişim reddedilir", async () => {
    expect((await post({ question: "Kese var mı?", answer: " " })).status).toBe(400);
    requireHotelAccessMock.mockResolvedValue({ user: null, hotel: null, response: new Response(null, { status: 403 }) });
    expect((await post({ question: "Kese var mı?", answer: "Evet." })).status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Misafir oturumu (guest_sessions) route testleri
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it, vi } from "vitest";

// isDbConfigured:true mock'u rate-limit.ts'in de aynı bayrağı paylaşmasına
// yol açar (ikisi de "@/lib/db"'den import eder) — rate limiter'ı doğrudan
// mock'layıp bu route'un DB çağrılarından izole ediyoruz.
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => Promise.resolve(true),
  requestIp: (req: Request) => req.headers.get("x-forwarded-for") ?? "unknown",
}));

const selectResultMock = vi.fn();
const insertMock = vi.fn();
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => selectResultMock(),
        }),
      }),
    }),
    insert: () => ({
      values: (v: unknown) => ({ onConflictDoUpdate: (opts: unknown) => insertMock(v, opts) }),
    }),
  }),
  isDbConfigured: () => true,
}));

import { GET, PATCH } from "./route";

function makeGetRequest(params: Record<string, string>, ip: string) {
  const url = new URL("http://localhost/api/tour/session");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url, { headers: { "x-forwarded-for": ip } });
}

function makePatchRequest(body: unknown, ip: string) {
  return new Request("http://localhost/api/tour/session", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  selectResultMock.mockReset();
  insertMock.mockReset();
});

describe("GET /api/tour/session", () => {
  it("eksik parametrede 400 döner", async () => {
    const res = await GET(makeGetRequest({ token: "x" }, "10.1.0.1"));
    expect(res.status).toBe(400);
  });

  it("kayıt yoksa found:false döner", async () => {
    selectResultMock.mockResolvedValue([]);
    const res = await GET(
      makeGetRequest({ token: "tok-1", hotelSlug: "aurelia-bay", tourId: "demo-lobby" }, "10.1.0.2"),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, found: false });
  });

  it("kayıt varsa stepsSeen/lastStepId döner", async () => {
    selectResultMock.mockResolvedValue([{ stepsSeen: ["s1", "s2"], lastStepId: "s2" }]);
    const res = await GET(
      makeGetRequest({ token: "tok-2", hotelSlug: "aurelia-bay", tourId: "demo-lobby" }, "10.1.0.3"),
    );
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      found: true,
      stepsSeen: ["s1", "s2"],
      lastStepId: "s2",
    });
  });

  it("DB hatasında sohbeti kırmadan found:false döner", async () => {
    selectResultMock.mockRejectedValue(new Error("db down"));
    const res = await GET(
      makeGetRequest({ token: "tok-3", hotelSlug: "aurelia-bay", tourId: "demo-lobby" }, "10.1.0.4"),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, found: false });
  });
});

describe("PATCH /api/tour/session", () => {
  it("geçersiz gövdede 400 döner", async () => {
    const res = await PATCH(makePatchRequest({ sessionToken: "short" }, "10.1.0.5"));
    expect(res.status).toBe(400);
  });

  it("geçerli gövdede upsert eder", async () => {
    const res = await PATCH(
      makePatchRequest(
        {
          sessionToken: "a-valid-token-1234",
          hotelSlug: "aurelia-bay",
          tourId: "demo-lobby",
          stepsSeen: ["s1"],
          lastStepId: "s1",
        },
        "10.1.0.6",
      ),
    );
    expect(res.status).toBe(200);
    expect(insertMock).toHaveBeenCalledTimes(1);
    const [values] = insertMock.mock.calls[0]!;
    expect(values).toMatchObject({
      sessionToken: "a-valid-token-1234",
      hotelSlug: "aurelia-bay",
      tourId: "demo-lobby",
      stepsSeen: ["s1"],
      lastStepId: "s1",
    });
  });

  it("DB hatasında yine de 200 döner (misafir UX'i kırılmaz)", async () => {
    insertMock.mockImplementation(() => {
      throw new Error("db down");
    });
    const res = await PATCH(
      makePatchRequest(
        {
          sessionToken: "a-valid-token-1234",
          hotelSlug: "aurelia-bay",
          tourId: "demo-lobby",
          stepsSeen: ["s1"],
        },
        "10.1.0.7",
      ),
    );
    expect(res.status).toBe(200);
  });
});

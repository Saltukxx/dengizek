// ---------------------------------------------------------------------------
// GDPR ucu testleri — dışa aktarma ve anonimleştirme.
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it, vi } from "vitest";

const exportMock = vi.fn();
const anonymizeMock = vi.fn();
vi.mock("@/lib/inquiry-privacy", () => ({
  exportInquiryPersonalData: (...a: unknown[]) => exportMock(...a),
  anonymizeInquiry: (...a: unknown[]) => anonymizeMock(...a),
}));

const logAuditMock = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAuditMock(...a) }));

const rows: Record<string, unknown>[] = [];
vi.mock("@/lib/db", () => ({
  isDbConfigured: () => true,
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => rows }) }) }),
  }),
}));

const rateLimitOk = vi.fn<() => Promise<boolean>>();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => rateLimitOk(),
  requestIp: () => "1.2.3.4",
}));

import { GET, POST } from "./route";

const inquiry = {
  id: "inq-1",
  hotelId: "hotel-1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  accessTokenRevokedAt: null,
  accessTokenExpiresAt: new Date(Date.now() + 86_400_000),
};

function params() {
  return { params: Promise.resolve({ token: "tok" }) };
}

beforeEach(() => {
  rows.length = 0;
  rows.push({ ...inquiry });
  exportMock.mockReset();
  exportMock.mockResolvedValue({ talep: { id: "inq-1", ad: "Ada Lovelace" }, mesajlar: [], yorumlar: [] });
  anonymizeMock.mockReset();
  logAuditMock.mockReset();
  rateLimitOk.mockReset();
  rateLimitOk.mockResolvedValue(true);
});

describe("GET — veri dışa aktarma", () => {
  it("kişisel veriyi döner", async () => {
    const res = await GET(new Request("http://x"), params());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, data: { talep: { ad: "Ada Lovelace" } } });
  });

  it("geçersiz token'da 404", async () => {
    rows.length = 0;
    expect((await GET(new Request("http://x"), params())).status).toBe(404);
  });

  it("iptal edilmiş token'da 404", async () => {
    rows[0] = { ...inquiry, accessTokenRevokedAt: new Date() };
    expect((await GET(new Request("http://x"), params())).status).toBe(404);
  });

  it("hız limitinde 429", async () => {
    rateLimitOk.mockResolvedValue(false);
    expect((await GET(new Request("http://x"), params())).status).toBe(429);
  });
});

describe("POST — silme (anonimleştirme)", () => {
  it("anonimleştirir ve denetim kaydı bırakır", async () => {
    const res = await POST(new Request("http://x", { method: "POST" }), params());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, anonymized: true });
    expect(anonymizeMock).toHaveBeenCalledWith(expect.anything(), "inq-1");
  });

  it("denetim kaydı oturumsuz aktörle yazılır (FK ihlali olmaz)", async () => {
    await POST(new Request("http://x", { method: "POST" }), params());
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ actor: null, actorLabel: "misafir-portali" }),
    );
  });

  it("kişisel veriyi denetim kaydına yazmaz", async () => {
    await POST(new Request("http://x", { method: "POST" }), params());
    const entry = JSON.stringify(logAuditMock.mock.calls[0][0]);
    expect(entry).not.toContain("Ada Lovelace");
    expect(entry).not.toContain("ada@example.com");
  });

  it("token iptal edilmişse (ikinci çağrı) 404 ve tekrar anonimleştirmez", async () => {
    rows[0] = { ...inquiry, accessTokenRevokedAt: new Date() };
    expect((await POST(new Request("http://x", { method: "POST" }), params())).status).toBe(404);
    expect(anonymizeMock).not.toHaveBeenCalled();
  });

  it("hız limitinde 429", async () => {
    rateLimitOk.mockResolvedValue(false);
    expect((await POST(new Request("http://x", { method: "POST" }), params())).status).toBe(429);
  });
});

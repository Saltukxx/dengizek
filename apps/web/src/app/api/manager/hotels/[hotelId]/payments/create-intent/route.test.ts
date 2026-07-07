import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/guards", () => ({ requireHotelAccess: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
import { POST } from "./route";

describe("payment feature flag", () => {
  const previous = process.env.PAYMENTS_ENABLED;
  afterEach(() => { process.env.PAYMENTS_ENABLED = previous; });

  it("kapalıyken DB veya sağlayıcıya dokunmadan 503 döner", async () => {
    process.env.PAYMENTS_ENABLED = "false";
    const res = await POST(
      new Request("http://localhost/api/payments", { method: "POST", body: "{}" }),
      { params: Promise.resolve({ hotelId: "hotel-1" }) },
    );
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ ok: false, code: "PAYMENTS_DISABLED" });
  });
});

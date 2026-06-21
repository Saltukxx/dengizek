import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const requireHotelAccessMock = vi.fn();

vi.mock("@/lib/auth/guards", () => ({
  requireHotelAccess: (...args: unknown[]) => requireHotelAccessMock(...args),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  };
});

import { POST } from "./route";

function makeRequest(form?: FormData) {
  return new Request("http://localhost/api/manager/media/upload-image", {
    method: "POST",
    body: form,
  });
}

beforeEach(() => {
  requireHotelAccessMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/manager/media/upload-image", () => {
  it("hotelId olmadan 400 döner", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: "hotelId gerekli.",
    });
    expect(requireHotelAccessMock).not.toHaveBeenCalled();
  });

  it("yetkisiz erişimde guard yanıtını döner", async () => {
    const denied = NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 403 });
    requireHotelAccessMock.mockResolvedValue({ response: denied });

    const form = new FormData();
    form.append("hotelId", "hotel-1");
    const res = await POST(makeRequest(form));
    expect(res.status).toBe(403);
  });
});

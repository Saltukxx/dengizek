import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ signIn: vi.fn(), getSession: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: vi.fn(), useSearchParams: vi.fn() }));

import { safeCallbackPath } from "./login-form";

const origin = "http://64.226.108.21:8080";

describe("safeCallbackPath", () => {
  it.each([
    ["/dashboard/rooms", "/dashboard/rooms"],
    [`${origin}/dashboard?x=1`, "/dashboard?x=1"],
  ])("aynı siteye dönüşe izin verir: %s", (raw, expected) => {
    expect(safeCallbackPath(raw, origin)).toBe(expected);
  });

  it.each(["https://example.com", "//example.com", "/\\example.com", "javascript:alert(1)"])(
    "dış adresi reddeder: %s",
    (raw) => {
      expect(safeCallbackPath(raw, origin)).toBeNull();
    },
  );
});

import { describe, expect, it } from "vitest";
import { generatePortalToken, hashPortalToken, portalTokenExpiry } from "./inquiry-portal-token";

describe("inquiry portal tokens", () => {
  it("ham token yerine kararlı SHA-256 hash üretir", () => {
    const token = generatePortalToken();
    expect(token.length).toBeGreaterThan(30);
    expect(hashPortalToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashPortalToken(token)).not.toBe(token);
  });

  it("yaklaşık 90 günlük geçerlilik üretir", () => {
    const days = (portalTokenExpiry().getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(89.9);
    expect(days).toBeLessThanOrEqual(90);
  });
});

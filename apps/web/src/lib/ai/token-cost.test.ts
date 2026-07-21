import { describe, expect, it } from "vitest";
import { estimateCostUsd } from "@/lib/ai/token-cost";

describe("estimateCostUsd", () => {
  it("0 token için 0 döner", () => {
    expect(estimateCostUsd(0, 0)).toBe(0);
  });

  it("1M input token için 0.15 USD hesaplar", () => {
    expect(estimateCostUsd(1_000_000, 0)).toBeCloseTo(0.15, 6);
  });

  it("1M output token için 0.60 USD hesaplar", () => {
    expect(estimateCostUsd(0, 1_000_000)).toBeCloseTo(0.6, 6);
  });

  it("input ve output birlikte toplanır", () => {
    expect(estimateCostUsd(1_000_000, 1_000_000)).toBeCloseTo(0.75, 6);
  });
});

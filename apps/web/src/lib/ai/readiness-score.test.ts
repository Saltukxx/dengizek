import { describe, expect, it } from "vitest";
import {
  computeAiReadinessScore,
  DEFAULT_AI_PERSONA,
} from "@/lib/ai/readiness-score";

describe("computeAiReadinessScore", () => {
  it("eksik veride düşük skor ve issue listesi", () => {
    const result = computeAiReadinessScore({
      aiPersona: "",
      tourSteps: [{ stepId: "s1", aiVisible: true, aiDescription: "kısa" }],
      rooms: [{ name: "Deluxe", priceOnRequest: false, priceMinor: null }],
      aiPolicies: [],
    });
    expect(result.score).toBeLessThan(100);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("tam veride 100 skor", () => {
    const result = computeAiReadinessScore({
      aiPersona: "Deniz Rehberi",
      cancellationPolicy: "24 saat önce ücretsiz iptal",
      tourSteps: [
        { stepId: "s1", aiVisible: true, aiDescription: "Geniş lobi alanı ve resepsiyon." },
      ],
      rooms: [{ name: "Deluxe", priceOnRequest: false, priceMinor: 10000 }],
      aiPolicies: [],
    });
    expect(result.score).toBe(100);
    expect(result.issues).toHaveLength(0);
  });

  it("varsayılan persona özelleştirilmiş sayılmaz", () => {
    const result = computeAiReadinessScore({
      aiPersona: DEFAULT_AI_PERSONA,
      cancellationPolicy: "24 saat önce ücretsiz iptal",
      tourSteps: [
        { stepId: "s1", aiVisible: true, aiDescription: "Geniş lobi alanı ve resepsiyon." },
      ],
      rooms: [{ name: "Deluxe", priceOnRequest: false, priceMinor: 10000 }],
      aiPolicies: [],
    });
    expect(result.score).toBeLessThan(100);
    expect(result.issues.some((i) => i.includes("persona"))).toBe(true);
  });
});

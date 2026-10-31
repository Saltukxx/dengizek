import { describe, expect, it } from "vitest";
import {
  computeAiReadinessScore,
  criticalGaps,
  DEFAULT_AI_PERSONA,
  type CriticalInput,
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

describe("kritik bilgi eksikleri", () => {
  const room = (over: Partial<CriticalInput["rooms"][number]> = {}) => ({
    name: "Standart", capacityAdults: 2, capacityChildren: 1, boardType: "yarim-pansiyon", description: null, ...over,
  });

  it("yapısal alan ya da otel metni yeterli", () => {
    expect(criticalGaps({ checkInTime: "14:00", checkOutTime: "12:00", petsAllowed: false, texts: [], rooms: [room()] })).toEqual([]);
    expect(
      criticalGaps({
        texts: ["Giriş saati 14:00 çıkış saati ise 12:00 dir.", "Evcil hayvan kabul edilmez.", "Konaklama: Yarım Pansiyon"],
        rooms: [room({ boardType: "sadece-oda" })],
      }),
    ).toEqual([]);
  });

  it("eksikler: saat, evcil hayvan, yeme-içme, uyuşmayan kapasite", () => {
    const gaps = criticalGaps({
      checkInTime: "14:00",
      texts: [],
      rooms: [room({ boardType: "sadece-oda", name: "Aile", description: "Kapasite: 4 Kişilik - Maksimum 3 yetişkin + 1 çocuk" })],
    });
    expect(gaps.map((g) => g.field)).toEqual(["giris-cikis", "evcil-hayvan", "yeme-icme", "oda-kapasite"]);
    expect(gaps[0]!.message).toMatch(/^Çıkış saati/);
    expect(gaps[3]!.message).toContain("“Aile”");
  });

  it("skor kritik alanları da sayar", () => {
    const base = { aiPersona: "Ada", cancellationPolicy: "7 gün", tourSteps: [], rooms: [{ name: "S", priceOnRequest: true, priceMinor: null }] };
    expect(computeAiReadinessScore(base).score).toBe(100);
    const r = computeAiReadinessScore({ ...base, critical: { texts: [], rooms: [room()] } });
    // 4 temel + 4 kritik puandan 2 kritik eksik (saat, evcil hayvan).
    expect(r.score).toBe(75);
    expect(r.issues[0]).toMatch(/saati belirtilmemiş/);
  });
});

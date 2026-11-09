import { describe, expect, it, vi } from "vitest";
import { QuotaExhaustedError, withQuotaRetry } from "./quota-retry";

const rateLimit = (body: string) => Object.assign(new Error(`Resource has been exhausted (e.g. check quota). ${body}`), { statusCode: 429 });

describe("model kotası", () => {
  it("dakikalık sınır: önerilen süre kadar bekleyip tekrar dener", async () => {
    const sleep = vi.fn(async () => {});
    let calls = 0;
    const result = await withQuotaRetry(async () => {
      calls += 1;
      if (calls < 3) throw rateLimit('"retryDelay": "7s"');
      return "ok";
    }, sleep);
    expect(result).toBe("ok");
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(7500);
  });

  it("günlük kota bitti: beklemeden 'bekliyor' hatası", async () => {
    const sleep = vi.fn(async () => {});
    await expect(withQuotaRetry(async () => { throw rateLimit("GenerateRequestsPerDayPerProjectPerModel-FreeTier"); }, sleep)).rejects.toBeInstanceOf(QuotaExhaustedError);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("geçici yoğunluk (503): artan aralıkla tekrar dener, tükenirse bekliyor", async () => {
    const sleep = vi.fn(async (ms: number) => { void ms; });
    const busy = Object.assign(new Error("This model is currently experiencing high demand."), { statusCode: 503 });
    await expect(withQuotaRetry(async () => { throw busy; }, sleep)).rejects.toBeInstanceOf(QuotaExhaustedError);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([5000, 10000, 20000]);
  });

  it("kota dışı hata olduğu gibi fırlar", async () => {
    await expect(withQuotaRetry(async () => { throw new Error("bağlantı koptu"); })).rejects.toThrow("bağlantı koptu");
  });
});

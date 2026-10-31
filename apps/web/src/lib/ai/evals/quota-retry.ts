import { APICallError } from "ai";

// ---------------------------------------------------------------------------
// Kota: dakikalık sınırda bekleyip tekrar dene; günlük kota bittiyse soru
// "bekliyor" sayılır (hata değil) — büyük koşular altyapı hatasıyla kırılmasın.
// ---------------------------------------------------------------------------

/** Günlük ücretsiz kota bitti: soru bu koşuda değerlendirilemez. */
export class QuotaExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaExhaustedError";
  }
}

const MAX_QUOTA_RETRIES = 3;
const MAX_QUOTA_WAIT_MS = 65_000;

function quotaInfo(error: unknown): { quota: boolean; daily: boolean; waitMs: number } {
  const text = `${String(error)} ${APICallError.isInstance(error) ? (error.responseBody ?? "") : ""}`;
  const quota = (APICallError.isInstance(error) && error.statusCode === 429) || /quota|RESOURCE_EXHAUSTED|429/i.test(text);
  const daily = /PerDay|per day|daily/i.test(text);
  const seconds = Number(text.match(/retry(?:Delay)?[^0-9]{0,20}(\d+(?:\.\d+)?)\s*s/i)?.[1]);
  return { quota, daily, waitMs: Number.isFinite(seconds) ? Math.ceil(seconds * 1000) + 500 : 20_000 };
}

export async function withQuotaRetry<T>(call: () => Promise<T>, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      const info = quotaInfo(error);
      if (!info.quota) throw error;
      if (info.daily || attempt >= MAX_QUOTA_RETRIES || info.waitMs > MAX_QUOTA_WAIT_MS) {
        throw new QuotaExhaustedError(info.daily ? "Günlük model kotası bitti" : "Model kotası: bekleme süresi aşıldı");
      }
      await sleep(info.waitMs);
    }
  }
}


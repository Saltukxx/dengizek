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

function quotaInfo(error: unknown, attempt: number): { quota: boolean; daily: boolean; waitMs: number } {
  const status = (error as { statusCode?: number } | null)?.statusCode;
  const text = `${String(error)} ${APICallError.isInstance(error) ? (error.responseBody ?? "") : ""}`;
  // Geçici yoğunluk (503 "high demand") da beklenip tekrar denenir.
  const overloaded = status === 503 || /high demand|overloaded|UNAVAILABLE/i.test(text);
  const quota = overloaded || status === 429 || /quota|RESOURCE_EXHAUSTED|429/i.test(text);
  const daily = !overloaded && /PerDay|per day|daily/i.test(text);
  const seconds = Number(text.match(/retry(?:Delay)?[^0-9]{0,20}(\d+(?:\.\d+)?)\s*s/i)?.[1]);
  const waitMs = Number.isFinite(seconds) ? Math.ceil(seconds * 1000) + 500 : overloaded ? 5_000 * 2 ** attempt : 20_000;
  return { quota, daily, waitMs };
}

export async function withQuotaRetry<T>(call: () => Promise<T>, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      const info = quotaInfo(error, attempt);
      if (!info.quota) throw error;
      if (info.daily || attempt >= MAX_QUOTA_RETRIES || info.waitMs > MAX_QUOTA_WAIT_MS) {
        throw new QuotaExhaustedError(info.daily ? "Günlük model kotası bitti" : "Model kotası/yoğunluğu: tekrar denemeler tükendi");
      }
      await sleep(info.waitMs);
    }
  }
}


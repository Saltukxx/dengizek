import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_HEDGE_AFTER_MS, hedgeAfterMs, hedgedStream, type StreamResult } from "./hedged-stream";

type Part = { type: string; [key: string]: unknown };

/**
 * Sahte model isteği: açılış parçası hemen gelir, ilk metin `delayMs` sonra.
 * `error` verilirse metin yerine akışta hata parçası gelir.
 */
function fakeAttempt(label: string, delayMs: number, options: { error?: Error; throws?: Error } = {}) {
  const cancelled = vi.fn();
  const run = async (): Promise<StreamResult> => {
    if (options.throws) throw options.throws;
    const stream = new ReadableStream<Part>({
      start(controller) {
        controller.enqueue({ type: "stream-start", warnings: [] });
        setTimeout(() => {
          if (options.error) {
            controller.enqueue({ type: "error", error: options.error });
          } else {
            controller.enqueue({ type: "text-delta", id: "t", delta: label });
            controller.enqueue({ type: "finish" });
          }
          controller.close();
        }, delayMs);
      },
      cancel: cancelled,
    });
    return { stream } as unknown as StreamResult;
  };
  return { run, cancelled };
}

/** Sıralı çağrılarda farklı sahte denemeler döndüren run. */
function sequence(...attempts: Array<ReturnType<typeof fakeAttempt>>) {
  let i = 0;
  return vi.fn(() => attempts[i++]!.run());
}

async function readAll(result: StreamResult): Promise<Part[]> {
  const parts: Part[] = [];
  const reader = (result.stream as ReadableStream<Part>).getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return parts;
    parts.push(value);
  }
}

const textOf = (parts: Part[]) => parts.filter((p) => p.type === "text-delta").map((p) => p.delta).join("");

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("hedgedStream", () => {
  it("ilk istek zamanında yanıt verirse tekrar edilmez, parçalar kaybolmaz", async () => {
    const run = sequence(fakeAttempt("hızlı", 1000));
    const onHedge = vi.fn();
    const promise = hedgedStream(run, 5000, onHedge);
    await vi.advanceTimersByTimeAsync(1000);
    const parts = await readAll(await promise);

    expect(run).toHaveBeenCalledTimes(1);
    expect(onHedge).not.toHaveBeenCalled();
    expect(parts.map((p) => p.type)).toEqual(["stream-start", "text-delta", "finish"]);
  });

  it("ilk istek gecikirse ikinci istek gönderilir, önce yanıt veren kazanır", async () => {
    const slow = fakeAttempt("yavaş", 40_000);
    const fast = fakeAttempt("tekrar", 1000);
    const run = sequence(slow, fast);
    const onHedge = vi.fn();
    const promise = hedgedStream(run, 5000, onHedge);

    await vi.advanceTimersByTimeAsync(5000);
    expect(onHedge).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;
    expect(textOf(await readAll(result))).toBe("tekrar");

    // Kaybeden istek sonunda yanıt verince iptal edilir.
    await vi.advanceTimersByTimeAsync(40_000);
    expect(slow.cancelled).toHaveBeenCalled();
  });

  it("tekrar gönderildikten sonra ilk istek önce yanıt verirse o kullanılır", async () => {
    const run = sequence(fakeAttempt("ilk", 6000), fakeAttempt("ikinci", 5000));
    const promise = hedgedStream(run, 5000);
    await vi.advanceTimersByTimeAsync(6000);
    expect(textOf(await readAll(await promise))).toBe("ilk");
  });

  it("ilk istek hata verirse beklemeden hatayı iletir (yedek modele geçilsin)", async () => {
    const error = new Error("503");
    const run = sequence(fakeAttempt("", 0, { throws: error }));
    const promise = hedgedStream(run, 5000);
    const assertion = expect(promise).rejects.toBe(error);
    await vi.advanceTimersByTimeAsync(0);
    await assertion;
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("akıştaki hata parçası da başarısız deneme sayılır; diğer deneme sürüyorsa beklenir", async () => {
    const run = sequence(fakeAttempt("", 7000, { error: new Error("akış hatası") }), fakeAttempt("tekrar", 3000));
    const promise = hedgedStream(run, 5000);
    await vi.advanceTimersByTimeAsync(8000);
    expect(textOf(await readAll(await promise))).toBe("tekrar");
  });

  it("iki deneme de hata verirse ilk hata fırlatılır", async () => {
    const first = new Error("ilk");
    const run = sequence(
      fakeAttempt("", 6000, { error: first }),
      fakeAttempt("", 1500, { error: new Error("ikinci") }),
    );
    const promise = hedgedStream(run, 5000);
    const assertion = expect(promise).rejects.toBe(first);
    await vi.advanceTimersByTimeAsync(7000);
    await assertion;
  });

  it("0 ms ile tekrar kapalıdır", async () => {
    const run = sequence(fakeAttempt("tek", 60_000));
    const promise = hedgedStream(run, 0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(textOf(await readAll(await promise))).toBe("tek");
  });
});

describe("hedgeAfterMs", () => {
  it("varsayılan, ayar ve geçersiz değer", () => {
    expect(hedgeAfterMs()).toBe(DEFAULT_HEDGE_AFTER_MS);
    vi.stubEnv("AI_HEDGE_AFTER_MS", "0");
    expect(hedgeAfterMs()).toBe(0);
    vi.stubEnv("AI_HEDGE_AFTER_MS", "3000");
    expect(hedgeAfterMs()).toBe(3000);
    vi.stubEnv("AI_HEDGE_AFTER_MS", "abc");
    expect(hedgeAfterMs()).toBe(DEFAULT_HEDGE_AFTER_MS);
  });
});

// ---------------------------------------------------------------------------
// Geciken model isteğini tekrarlama ("hedged request").
//
// Gemini bazen hata vermeden yavaşlıyor: aynı soru bir denemede 2 sn, bir
// başkasında 40+ sn sürdü (Kasım 2026 ölçümü). Hata olmadığı için yedek
// modele geçilmiyordu. Burada ilk istek belirli sürede yanıt vermeye
// başlamazsa aynı istek bir kez daha gönderilir; hangisi önce yanıt vermeye
// başlarsa o kullanılır, diğeri iptal edilir.
//
// "Yanıt vermeye başlamak" = sağlayıcının açılış parçalarından (stream-start,
// response-metadata) sonraki ilk gerçek parça. Ek maliyet yalnız yavaş
// anlarda ve yalnız giriş token'ları kadardır.
// ---------------------------------------------------------------------------

import type { LanguageModelMiddleware } from "ai";

type WrapStream = NonNullable<LanguageModelMiddleware["wrapStream"]>;
type DoStream = Parameters<WrapStream>[0]["doStream"];
export type StreamResult = Awaited<ReturnType<DoStream>>;
type StreamPart = StreamResult["stream"] extends ReadableStream<infer P> ? P : never;

/** Varsayılan bekleme: normal ilk yanıt ~1–1,5 sn sürüyor. */
export const DEFAULT_HEDGE_AFTER_MS = 5000;

/** AI_HEDGE_AFTER_MS ile ayarlanır; 0 kapatır. */
export function hedgeAfterMs(): number {
  const raw = process.env.AI_HEDGE_AFTER_MS?.trim();
  if (!raw) return DEFAULT_HEDGE_AFTER_MS;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_HEDGE_AFTER_MS;
}

const OPENING_PARTS = new Set(["stream-start", "response-metadata"]);

interface Started {
  result: StreamResult;
  cancel: () => void;
}

/** İsteği başlatır, ilk gerçek parça gelene kadar bekler; okunanlar kaybolmaz. */
async function startAndWaitFirstPart(run: DoStream): Promise<Started> {
  const result = await run();
  const reader = result.stream.getReader();
  const head: StreamPart[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value.type === "error") {
      void reader.cancel().catch(() => {});
      throw value.error;
    }
    head.push(value);
    if (!OPENING_PARTS.has(value.type)) break;
  }

  const stream = new ReadableStream<StreamPart>({
    start(controller) {
      for (const part of head) controller.enqueue(part);
    },
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });

  return {
    result: { ...result, stream },
    cancel: () => void reader.cancel().catch(() => {}),
  };
}

/**
 * `run` ilk denemede `afterMs` içinde yanıt vermeye başlamazsa bir kez daha
 * çağrılır. Önce başlayan kazanır. İkisi de hata verirse ilk hata fırlatılır
 * (çağıran yedek modele geçebilsin). afterMs = 0 → tekrar yok.
 */
export function hedgedStream(run: DoStream, afterMs: number, onHedge?: () => void): Promise<StreamResult> {
  if (afterMs <= 0) return Promise.resolve(run());

  return new Promise<StreamResult>((resolve, reject) => {
    let settled = false;
    let pending = 0;
    let firstError: unknown;

    const launch = () => {
      pending += 1;
      startAndWaitFirstPart(run).then(
        (started) => {
          pending -= 1;
          if (settled) {
            started.cancel();
            return;
          }
          settled = true;
          clearTimeout(timer);
          resolve(started.result);
        },
        (error: unknown) => {
          pending -= 1;
          if (firstError === undefined) firstError = error;
          // Başka deneme sürüyorsa onu bekle; sürmüyorsa hatayı hemen ilet
          // (bekleme süresini doldurmadan yedek modele geçilsin).
          if (settled || pending > 0) return;
          settled = true;
          clearTimeout(timer);
          reject(firstError);
        },
      );
    };

    launch();
    // Deneme sonuçları her zaman eşzamansız gelir; timer o ana kadar tanımlıdır.
    const timer = setTimeout(() => {
      if (settled) return;
      onHedge?.();
      launch();
    }, afterMs);
  });
}

// ---------------------------------------------------------------------------
// Manifest medya URL'lerini imzalar.
//
// Neden ayrı dosya: imzalama snapshot'a DEĞİL, manifest misafire çıkarken
// uygulanır. tours.publishedManifest kalıcıdır; imza dakikalar içinde ölür.
// Bu yüzden DB/snapshot kanonik (imzasız) URL tutar, imza burada eklenir.
// ---------------------------------------------------------------------------

import { playbackTokenExpiry, signPlaybackUrl, isBunnySigningConfigured } from "@/lib/bunny/sign";
import type { TourManifest } from "@/lib/schemas/tour-manifest";

/**
 * Manifestin bir kopyasını imzalı medya URL'leriyle döner.
 * İmzalama kapalıysa (anahtar yok) manifest olduğu gibi döner —
 * `mediaTokenExpiresAt` da eklenmez, istemci yenileme denemez.
 */
export function signManifestMedia(manifest: TourManifest, ttlSec?: number): TourManifest {
  if (!isBunnySigningConfigured()) return manifest;

  const nowSec = Math.floor(Date.now() / 1000);
  const sign = (url: string | undefined) =>
    url ? signPlaybackUrl(url, { ttlSec, nowSec }) : url;

  return {
    ...manifest,
    steps: manifest.steps.map((step) => ({
      ...step,
      media: { ...step.media, src: signPlaybackUrl(step.media.src, { ttlSec, nowSec }) },
      captionsVttUrl: sign(step.captionsVttUrl),
      narrationUrl: sign(step.narrationUrl),
    })),
    mediaTokenExpiresAt: ttlSec ? nowSec + ttlSec : playbackTokenExpiry(nowSec),
  };
}

/**
 * Adım kimliği → medya URL'i (yenileme ucu bunu döner).
 * Girdi ZATEN imzalanmış bir manifesttir (getPublishedManifest imzalar) —
 * burada tekrar imzalanmaz.
 */
export function buildSignedSourceMap(manifest: TourManifest) {
  const sources: Record<string, string> = {};
  for (const step of manifest.steps) sources[step.stepId] = step.media.src;
  return { sources, mediaTokenExpiresAt: manifest.mediaTokenExpiresAt ?? null };
}

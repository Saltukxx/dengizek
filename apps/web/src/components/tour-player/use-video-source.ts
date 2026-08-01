"use client";

// ---------------------------------------------------------------------------
// Video kaynağı yönetimi — Bunny Stream HLS (playlist.m3u8) çoğu tarayıcıda
// yalnızca hls.js (MSE) ile oynar; Safari native HLS destekler, MP4 her yerde
// native oynar. Bu hook kaynağı imperatif olarak bağlar:
//
//   - .m3u8 + native HLS yok  → hls.js dinamik import + attachMedia
//   - .m3u8 + Safari          → video.src = src (native)
//   - .mp4 / diğer            → video.src = src (native)
//
// JSX'te `src` attribute'u KULLANILMAZ — hem hls.js'in MediaSource blob'u ile
// çakışmasın hem de canPlayType kontrolü client-only olduğundan SSR hydration
// uyuşmazlığı olmasın diye.
//
// Hata kurtarma sınırlı ve deterministiktir: fatal network hatasında 2 kez
// startLoad() denenir, fatal media hatasında 1 kez recoverMediaError();
// sonrasında onFatalError çağrılır. retry() her şeyi sıfırlayıp yeniden bağlar.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type Hls from "hls.js";

export function isHlsSource(src: string): boolean {
  return /\.m3u8(\?|#|$)/i.test(src);
}

function supportsNativeHls(video: HTMLVideoElement): boolean {
  return video.canPlayType("application/vnd.apple.mpegurl") !== "";
}

const MAX_NETWORK_RETRIES = 2;

interface UseVideoSourceOptions {
  /** Adım medya URL'si (HLS playlist veya progressive dosya). */
  src: string;
  /** Adım kimliği — key remount ile aynı src'li adımlar arasında da yeniden bağlanmak için. */
  stepId: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Kurtarma denemeleri tükendiğinde çağrılır. */
  onFatalError: (message: string) => void;
}

export function useVideoSource({ src, stepId, videoRef, onFatalError }: UseVideoSourceOptions) {
  const [attachToken, setAttachToken] = useState(0);
  // hls.js aktifken <video>'nun native error handler'ı devre dışı kalmalı —
  // aksi halde hls'in kurtaracağı bir media hatası anında fatal sayılır.
  const [usingHls, setUsingHls] = useState(false);
  const onFatalErrorRef = useRef(onFatalError);
  onFatalErrorRef.current = onFatalError;
  const hlsRef = useRef<Hls | null>(null);
  // İmza yenilendiğinde src değişir ama ADIM aynı kalır — bu durumda videoyu
  // baştan başlatmak turu bozar. Aynı adımda yeniden bağlanırken pozisyonu
  // koruyabilmek için son adımı ve o anki süreyi tutarız.
  const lastStepIdRef = useRef<string | null>(null);
  const resumeTimeRef = useRef(0);

  /** Hata ekranındaki "Tekrar dene" — kaynağı sıfırdan bağlar. */
  const retry = useCallback(() => {
    setAttachToken((t) => t + 1);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stepId) return;

    if (!src) {
      onFatalErrorRef.current("Bu adımın videosu henüz hazır değil.");
      return;
    }

    // Aynı adımda yeniden bağlanıyorsak (imza yenilendi) pozisyonu geri al.
    const isSameStep = lastStepIdRef.current === stepId;
    const resumeAt = isSameStep ? resumeTimeRef.current : 0;
    lastStepIdRef.current = stepId;

    const restorePosition = () => {
      if (resumeAt > 0 && Number.isFinite(resumeAt)) {
        try {
          video.currentTime = resumeAt;
        } catch {
          // Bazı tarayıcılar metadata gelmeden currentTime yazmayı reddeder —
          // loadedmetadata dinleyicisi ikinci şansı verir.
        }
      }
    };

    // Bağlantı boyunca ilerlemeyi takip et ki bir sonraki yeniden bağlanmada
    // kaldığı yerden devam edebilelim.
    const trackTime = () => {
      if (video.currentTime > 0) resumeTimeRef.current = video.currentTime;
    };
    video.addEventListener("timeupdate", trackTime);
    video.addEventListener("loadedmetadata", restorePosition);

    if (!isHlsSource(src) || supportsNativeHls(video)) {
      // Native yol — Safari HLS veya progressive MP4.
      setUsingHls(false);
      video.src = src;
      video.load();
      return () => {
        video.removeEventListener("timeupdate", trackTime);
        video.removeEventListener("loadedmetadata", restorePosition);
        video.removeAttribute("src");
      };
    }

    setUsingHls(true);
    let cancelled = false;
    let hls: Hls | null = null;

    void import("hls.js").then(({ default: HlsCtor }) => {
      if (cancelled) return;
      if (!HlsCtor.isSupported()) {
        onFatalErrorRef.current("Tarayıcınız bu video formatını desteklemiyor.");
        return;
      }

      let networkRetries = 0;
      let mediaRecoveryUsed = false;

      hls = new HlsCtor({
        // Tur adımları kısa klipler — agresif ileri-buffer gereksiz.
        maxBufferLength: 30,
      });
      hlsRef.current = hls;

      hls.on(HlsCtor.Events.ERROR, (_event, data) => {
        if (!data.fatal || !hls) return;
        if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR && networkRetries < MAX_NETWORK_RETRIES) {
          networkRetries += 1;
          hls.startLoad();
          return;
        }
        if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR && !mediaRecoveryUsed) {
          mediaRecoveryUsed = true;
          hls.recoverMediaError();
          return;
        }
        onFatalErrorRef.current("Video yüklenemedi veya oynatılamadı.");
      });

      hls.on(HlsCtor.Events.MANIFEST_PARSED, restorePosition);
      hls.loadSource(src);
      hls.attachMedia(video);
    });

    return () => {
      cancelled = true;
      video.removeEventListener("timeupdate", trackTime);
      video.removeEventListener("loadedmetadata", restorePosition);
      hls?.destroy();
      if (hlsRef.current === hls) hlsRef.current = null;
    };
    // stepId: aynı src'yi kullanan farklı adımlar <video key={stepId}> ile
    // remount olur — yeni elemente yeniden bağlanmak için bağımlılıkta.
  }, [src, stepId, videoRef, attachToken]);

  return { retry, usingHls };
}

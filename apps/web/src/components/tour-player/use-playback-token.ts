"use client";

// ---------------------------------------------------------------------------
// İmzalı medya URL'lerinin süresi dolmadan yenilenmesi.
//
// Ana planın kabul kriteri: "Signed URL expiry mid-tour: player recovers via
// refresh without losing step position." Uzun bir turda imza ortada ölürse
// hls.js segment isteklerinde 403 alır ve video kırılır.
//
// Yaklaşım: manifestteki mediaTokenExpiresAt'e bakıp bitişten REFRESH_MARGIN_SEC
// önce yenileme ucunu çağırırız. Dönen stepId→src haritası bir state'te tutulur;
// TourPlayer video kaynağını bu haritadan okur. Adım kimliği değişmediği için
// oynatma pozisyonu korunur (bkz. TourPlayer'daki currentTime geri yükleme).
//
// İmzalama kapalıysa (anahtar yok) uç `signing: false` döner ve hook tamamen
// devre dışı kalır — geliştirme/mock akışı hiç etkilenmez.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import type { TourManifest } from "@/lib/schemas/tour-manifest";

/** Bitişten bu kadar önce yenile — uzun segment indirmeleri için pay bırakır. */
const REFRESH_MARGIN_SEC = 300;
/** Saat kayması / anlık hata durumunda sonsuz döngüye girmemek için taban. */
const MIN_REFRESH_DELAY_MS = 10_000;
const MAX_CONSECUTIVE_FAILURES = 3;

interface PlaybackTokenState {
  /** stepId → imzalı URL. Boşsa manifestteki orijinal URL kullanılır. */
  sources: Record<string, string>;
  /** Yenileme sırasında kullanıcıya bilgi vermek için. */
  refreshing: boolean;
}

export function usePlaybackToken(manifest: TourManifest) {
  const [state, setState] = useState<PlaybackTokenState>({ sources: {}, refreshing: false });
  const expiresAtRef = useRef<number | null>(manifest.mediaTokenExpiresAt ?? null);
  const failuresRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  const { hotelSlug, tourId } = manifest;

  const refresh = useCallback(async () => {
    if (!isMountedRef.current) return;
    setState((s) => ({ ...s, refreshing: true }));
    try {
      const params = new URLSearchParams({ hotelSlug, tourId });
      const res = await fetch(`/api/tour/playback-token?${params.toString()}`);
      const json = (await res.json()) as {
        ok?: boolean;
        signing?: boolean;
        sources?: Record<string, string>;
        mediaTokenExpiresAt?: number | null;
      };
      if (!isMountedRef.current) return;

      if (!json.ok || json.signing === false) {
        // İmzalama kapalı ya da tur artık yayında değil — yeniden deneme.
        expiresAtRef.current = null;
        setState((s) => ({ ...s, refreshing: false }));
        return;
      }

      failuresRef.current = 0;
      expiresAtRef.current = json.mediaTokenExpiresAt ?? null;
      setState({ sources: json.sources ?? {}, refreshing: false });
    } catch {
      if (!isMountedRef.current) return;
      failuresRef.current += 1;
      setState((s) => ({ ...s, refreshing: false }));
      // Üst üste başarısızlıkta bırak — video mevcut imzayla oynadığı sürece
      // sorun yok; imza ölünce oynatıcının kendi hata ekranı devreye girer.
      if (failuresRef.current >= MAX_CONSECUTIVE_FAILURES) expiresAtRef.current = null;
    }
  }, [hotelSlug, tourId]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Bir sonraki yenilemeyi planla. state.sources değişince (yani yenileme
  // tamamlanınca) yeniden kurulur.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const expiresAt = expiresAtRef.current;
    if (!expiresAt) return;

    const msUntilRefresh = Math.max(
      MIN_REFRESH_DELAY_MS,
      (expiresAt - REFRESH_MARGIN_SEC) * 1000 - Date.now(),
    );
    timerRef.current = setTimeout(() => void refresh(), msUntilRefresh);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [refresh, state.sources]);

  /** Adımın güncel medya URL'i — yenilenmişse o, yoksa manifestteki. */
  const resolveSrc = useCallback(
    (stepId: string, fallback: string) => state.sources[stepId] ?? fallback,
    [state.sources],
  );

  return { resolveSrc, refreshing: state.refreshing, refresh };
}

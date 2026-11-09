"use client";

import { useCallback, useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics-client";

/** Misafir turdan nasıl ayrıldı. */
export type TourExitReason = "talep" | "sayfa-degisti" | "kapatti";

interface TourExitState {
  tourId: string;
  hotelSlug: string;
  currentStepId: string | null;
  stepsSeenCount: number;
  totalSteps: number;
}

/**
 * Turdan çıkışı bir kez kaydeder (tour_exit): son izlenen adım, toplam ve
 * son adımda geçen süre, ilerleme ve çıkış nedeni. "Hangi bölümden sonra
 * çıktı" analizi bu olaydan beslenir.
 *
 * Nedenler: talep formuna geçiş açıkça işaretlenir (markExit("talep"));
 * sekme kapanışı pagehide ile, site içi başka sayfaya geçiş bileşenin
 * kaldırılmasıyla yakalanır. Mobil tarayıcılar pagehide'ı her zaman
 * göndermeyebilir; o ziyaretlerde son tour_step_view olayı yedek olarak
 * kullanılır (bkz. journey-insights).
 */
export function useTourExit(state: TourExitState) {
  const stateRef = useRef(state);
  const startedAtRef = useRef(Date.now());
  const stepEnteredAtRef = useRef(Date.now());
  const sentRef = useRef(false);

  useEffect(() => {
    if (stateRef.current.currentStepId !== state.currentStepId) stepEnteredAtRef.current = Date.now();
    stateRef.current = state;
  }, [state]);

  const markExit = useCallback((reason: TourExitReason) => {
    if (sentRef.current) return;
    const s = stateRef.current;
    // Tur hiç başlamadıysa (adım görülmeden ayrıldıysa) çıkış sayılmaz.
    if (!s.currentStepId || s.stepsSeenCount === 0) return;
    sentRef.current = true;
    const now = Date.now();
    void trackEvent(
      "tour_exit",
      {
        tourId: s.tourId,
        stepId: s.currentStepId,
        stepsSeenCount: s.stepsSeenCount,
        totalSteps: s.totalSteps,
        progressRatio: s.totalSteps > 0 ? Math.round((s.stepsSeenCount / s.totalSteps) * 100) / 100 : 0,
        completed: s.totalSteps > 0 && s.stepsSeenCount >= s.totalSteps,
        watchedSec: Math.round((now - startedAtRef.current) / 1000),
        lastStepSec: Math.round((now - stepEnteredAtRef.current) / 1000),
        reason,
      },
      s.hotelSlug,
    );
  }, []);

  useEffect(() => {
    const onPageHide = () => markExit("kapatti");
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      markExit("sayfa-degisti");
    };
  }, [markExit]);

  return { markExit };
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TourManifest, TourStep } from "@/lib/schemas/tour-manifest";

export type TourPlayerPhase =
  | "loading"
  | "playing"
  | "pausedForInteraction"
  | "ended"
  | "error";

type Machine = {
  phase: TourPlayerPhase;
  stepIndex: number;
  errorMessage?: string;
};

const initialState: Machine = {
  phase: "loading",
  stepIndex: 0,
};

export function useTourPlayerMachine(
  manifest: TourManifest,
  options?: {
    onStepChange?: (index: number, step: TourStep) => void;
    onComplete?: () => void;
  },
) {
  const [machine, setMachine] = useState<Machine>(initialState);
  const videoRef = useRef<HTMLVideoElement>(null);
  const onComplete = options?.onComplete;

  const sorted = useMemo(
    () => [...manifest.steps].sort((a, b) => a.order - b.order),
    [manifest.steps],
  );
  const current = sorted[machine.stepIndex] ?? null;

  const goToIndex = useCallback(
    (nextIndex: number) => {
      if (nextIndex >= sorted.length) {
        setMachine({ phase: "ended", stepIndex: sorted.length - 1 });
        onComplete?.();
        return;
      }
      setMachine({ phase: "loading", stepIndex: nextIndex });
      options?.onStepChange?.(nextIndex, sorted[nextIndex]!);
    },
    [sorted, onComplete, options],
  );

  const goToStepId = useCallback(
    (stepId: string) => {
      const idx = sorted.findIndex((s) => s.stepId === stepId);
      if (idx < 0) return;
      goToIndex(idx);
    },
    [goToIndex, sorted],
  );

  const handleCanPlay = useCallback(() => {
    setMachine((m) => (m.phase === "error" ? m : { ...m, phase: "playing" }));
  }, []);

  const handleVideoEnded = useCallback(() => {
    setMachine((m) => {
      const step = sorted[m.stepIndex];
      if (!step) return m;
      if (m.stepIndex >= sorted.length - 1) {
        if (step.requiresUserContinue) {
          return { phase: "pausedForInteraction", stepIndex: m.stepIndex };
        }
        onComplete?.();
        return { phase: "ended", stepIndex: m.stepIndex };
      }
      if (step.requiresUserContinue) {
        return { phase: "pausedForInteraction", stepIndex: m.stepIndex };
      }
      return { phase: "loading", stepIndex: m.stepIndex + 1 };
    });
  }, [sorted, onComplete]);

  const continueFromPause = useCallback(() => {
    setMachine((m) => {
      if (m.phase !== "pausedForInteraction") return m;
      if (m.stepIndex >= sorted.length - 1) {
        onComplete?.();
        return { phase: "ended", stepIndex: m.stepIndex };
      }
      return { phase: "loading", stepIndex: m.stepIndex + 1 };
    });
  }, [onComplete, sorted.length]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !current) return;
    v.load();
  }, [current, machine.stepIndex]);

  return {
    videoRef,
    machine,
    sortedSteps: sorted,
    currentStep: current,
    setError: (message: string) =>
      setMachine((m) => ({ ...m, phase: "error", errorMessage: message })),
    handleCanPlay,
    handleVideoEnded,
    continueFromPause,
    goToIndex,
    goToStepId,
  };
}

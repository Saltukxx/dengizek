"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { TourManifest, TourStep } from "@/lib/schemas/tour-manifest";

// ---------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------

export interface GuideMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  chips?: string[];
  isThinking?: boolean;
}

export type TriggerReason =
  | "tourStart"
  | "stepStart"
  | "stepEnd"
  | "idle"
  | "userMessage"
  | "autoTourNext";

interface UseTourGuideOptions {
  manifest: TourManifest;
  currentStep: TourStep | null;
  stepsSeen: string[];
  onNavigate: (stepId: string) => void;
  onOpenInquiry: (roomSlug?: string, fromAi?: boolean) => void;
  onAutoTourEnd?: () => void;
  idleTimeoutMs?: number;
  maxNudges?: number;
}

// Yardımcı: benzersiz ID (yerel mock mesajları için)
let _idCounter = 0;
function uid(): string {
  return `gm-${Date.now()}-${++_idCounter}`;
}

// ---------------------------------------------------------------------------
// Ana hook
// ---------------------------------------------------------------------------

export function useTourGuide({
  manifest,
  currentStep,
  stepsSeen,
  onNavigate,
  onOpenInquiry,
  onAutoTourEnd,
  idleTimeoutMs = 12_000,
  maxNudges = 3,
}: UseTourGuideOptions) {
  const [isAutoTour, setIsAutoTour] = useState(false);
  const [nudgeCount, setNudgeCount] = useState(0);

  // Vercel AI SDK dışında yerel olarak eklenen mesajlar (örn. "Otomatik tur durduruldu")
  const [localMessages, setLocalMessages] = useState<GuideMessage[]>([]);

  const isAutoTourRef = useRef(false);
  const nudgeCountRef = useRef(0);
  const autoTourTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const firstStepStartSkippedRef = useRef(false);

  useEffect(() => {
    isAutoTourRef.current = isAutoTour;
  }, [isAutoTour]);

  useEffect(() => {
    nudgeCountRef.current = nudgeCount;
  }, [nudgeCount]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // useChat entegrasyonu
  // ---------------------------------------------------------------------------

  const { messages: chatMessages, sendMessage: chatSendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/tour/chat" }),
    // Tool çağrılarını yakala ve çalıştır
    onToolCall({ toolCall }) {
      if (!isMountedRef.current) return;
      const { toolName, input } = toolCall;

      switch (toolName) {
        case "navigateTo":
          onNavigate((input as { stepId: string }).stepId);
          break;
        case "openInquiry":
          onOpenInquiry((input as { roomSlug?: string }).roomSlug, true);
          break;
        case "autoTourNext": {
          const { stepId, delayMs } = input as { stepId: string; delayMs: number };
          autoTourTimerRef.current = setTimeout(() => {
            if (!isMountedRef.current) return;
            onNavigate(stepId);
          }, delayMs || 2000);
          break;
        }
        case "endAutoTour":
          setIsAutoTour(false);
          onAutoTourEnd?.();
          break;
        case "suggestNext":
          // Chips'ler mesaj dönüşümünde işlenir
          break;
      }
    },
  });

  const isLoading = status === "submitted" || status === "streaming";

  // ---------------------------------------------------------------------------
  // Mesajları birleştir & formatla
  // ---------------------------------------------------------------------------

  const mappedChatMessages: GuideMessage[] = chatMessages
    .filter((m) => {
      const textParts = m.parts?.filter((p) => p.type === "text") as { text: string }[] | undefined;
      const textContent = textParts?.map((p) => p.text).join("") || "";
      return textContent !== "[HIDDEN]";
    })
    .map((m) => {
      const textParts = m.parts?.filter((p) => p.type === "text") as { text: string }[] | undefined;
      const textContent = textParts?.map((p) => p.text).join("") || "";

      // SuggestNext tool çağrısından chips'leri çıkar
      const suggestNextToolPart = m.parts?.find((p) => p.type === "tool-suggestNext") as { input?: { chips?: string[] } } | undefined;
      const chips = suggestNextToolPart?.input?.chips;

      return {
        id: m.id,
        role: m.role as "user" | "assistant",
        content: textContent,
        chips,
      };
    });

  // chatMessages ve localMessages'i birleştir
  const allMessages = [...mappedChatMessages, ...localMessages];

  // ---------------------------------------------------------------------------
  // API Çağrısı (append ile)
  // ---------------------------------------------------------------------------

  const trigger = useCallback(
    async (reason: TriggerReason, userMessage?: string, stepIdOverride?: string) => {
      // Proaktif sınırı
      if (reason !== "userMessage" && !isAutoTourRef.current && nudgeCountRef.current >= maxNudges)
        return;

      const currentStepId = stepIdOverride ?? currentStep?.stepId ?? manifest.steps[0]?.stepId ?? "";

      const body = {
        hotelSlug: manifest.hotelSlug,
        tourId: manifest.tourId,
        currentStepId,
        stepsSeen,
        triggerReason: reason,
        isAutoTour: isAutoTourRef.current,
      };

      if (reason === "userMessage" && userMessage) {
        await chatSendMessage({ text: userMessage }, { body });
      } else {
        // Proaktif tetikleyici: Kullanıcı mesajı olarak "[HIDDEN]" gönder, UI'da gizle
        await chatSendMessage({ text: "[HIDDEN]" }, { body });
        setNudgeCount((n) => n + 1);
      }
    },
    [chatSendMessage, currentStep?.stepId, manifest, maxNudges, stepsSeen],
  );

  // ---------------------------------------------------------------------------
  // Kullanıcı mesajı gönder
  // ---------------------------------------------------------------------------

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      if (isAutoTourRef.current) {
        if (autoTourTimerRef.current) clearTimeout(autoTourTimerRef.current);
        setIsAutoTour(false);
      }

      resetIdleTimer();
      await trigger("userMessage", text);
    },
    [trigger, isLoading], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleChipClick = useCallback(
    (chip: string) => {
      void sendMessage(chip);
    },
    [sendMessage],
  );

  // ---------------------------------------------------------------------------
  // Idle timer
  // ---------------------------------------------------------------------------

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      if (!isMountedRef.current || isAutoTourRef.current) return;
      void trigger("idle");
    }, idleTimeoutMs);
  }, [trigger, idleTimeoutMs]);

  // ---------------------------------------------------------------------------
  // Player lifecycle tetikleyicileri
  // ---------------------------------------------------------------------------

  const notifyStepStart = useCallback(
    (stepId: string) => {
      resetIdleTimer();
      if (!firstStepStartSkippedRef.current) {
        firstStepStartSkippedRef.current = true;
        return;
      }
      void trigger("stepStart", undefined, stepId);
    },
    [resetIdleTimer, trigger],
  );

  const notifyStepEnd = useCallback(
    (stepId: string) => {
      void trigger("stepEnd", undefined, stepId);
    },
    [trigger],
  );

  useEffect(() => {
    void trigger("tourStart");
    resetIdleTimer();

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (autoTourTimerRef.current) clearTimeout(autoTourTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Otomatik tur
  // ---------------------------------------------------------------------------

  const startAutoTour = useCallback(() => {
    if (autoTourTimerRef.current) clearTimeout(autoTourTimerRef.current);
    isAutoTourRef.current = true;
    setIsAutoTour(true);
    firstStepStartSkippedRef.current = true;

    const firstVisibleStep = manifest.steps
      .filter((s) => s.aiVisible !== false)
      .sort((a, b) => a.order - b.order)[0];

    if (firstVisibleStep) {
      onNavigate(firstVisibleStep.stepId);
      void trigger("tourStart", undefined, firstVisibleStep.stepId);
    }
  }, [manifest.steps, onNavigate, trigger]);

  const stopAutoTour = useCallback(() => {
    if (autoTourTimerRef.current) clearTimeout(autoTourTimerRef.current);
    setIsAutoTour(false);
    setLocalMessages((prev) => [
      ...prev,
      {
        id: uid(),
        role: "assistant",
        content: "Otomatik tur durduruldu. Devam etmek ister misiniz?",
        chips: ["Turu yeniden başlat", "Serbest gez"],
      },
    ]);
  }, []);

  return {
    messages: allMessages,
    isThinking: isLoading,
    isAutoTour,
    sendMessage,
    handleChipClick,
    startAutoTour,
    stopAutoTour,
    notifyStepStart,
    notifyStepEnd,
  };
}

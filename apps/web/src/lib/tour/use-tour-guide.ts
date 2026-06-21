"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { TourManifest, TourStep } from "@/lib/schemas/tour-manifest";
import type { AiFactCard, AiFactQueryResult, AiPriceCard, AiPriceQueryResult } from "@/lib/ai/types";
import {
  computeCompletionState,
  getStepEndTriggerReason,
} from "@/lib/ai/completion-engine";
import { trackEvent } from "@/lib/analytics-client";

// ---------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------

export interface GuideMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  chips?: string[];
  priceCards?: AiPriceCard[];
  factCards?: AiFactCard[];
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

function extractToolOutput<T>(parts: unknown[] | undefined, toolName: string): T | undefined {
  if (!parts) return undefined;
  for (const raw of parts) {
    const part = raw as { type?: string; output?: T; result?: T };
    if (part.type === `tool-${toolName}`) {
      return part.output ?? part.result;
    }
  }
  return undefined;
}

function extractAllFactCards(parts: unknown[] | undefined): AiFactCard[] {
  if (!parts) return [];
  const cards: AiFactCard[] = [];
  for (const raw of parts) {
    const part = raw as { type?: string; output?: AiFactQueryResult };
    if (part.type === "tool-citeFact" && part.output?.ok && part.output.card) {
      cards.push(part.output.card);
    }
  }
  return cards;
}

function visibleSteps(manifest: TourManifest) {
  return manifest.steps
    .filter((s) => s.aiVisible !== false)
    .sort((a, b) => a.order - b.order);
}

function analyticsPayload(
  manifest: TourManifest,
  stepsSeen: string[],
  isAutoTour: boolean,
  stepId?: string,
) {
  const steps = visibleSteps(manifest);
  const completion = computeCompletionState(
    steps.map((s) => ({ stepId: s.stepId, title: s.title })),
    stepsSeen,
    stepId,
  );
  return {
    tourId: manifest.tourId,
    stepId,
    stepsSeenCount: completion.seenCount,
    totalSteps: completion.totalCount,
    progressRatio: completion.progressRatio,
    isAutoTour,
  };
}

/** autoTourNext hedef adımı — sunucu nextStepId öncelikli. */
export function resolveAutoTourTargetStepId(
  modelStepId: string,
  serverNextStepId: string | null,
): string {
  return serverNextStepId ?? modelStepId;
}

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
  const [localMessages, setLocalMessages] = useState<GuideMessage[]>([]);

  const isAutoTourRef = useRef(false);
  const nudgeCountRef = useRef(0);
  const autoTourTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const firstStepStartSkippedRef = useRef(false);
  const stepsSeenRef = useRef(stepsSeen);
  const currentStepRef = useRef(currentStep);
  const lastUserMessageRef = useRef("");
  const trackedToolMessageIdsRef = useRef(new Set<string>());
  const trackedOpenInquiryMessageIdsRef = useRef(new Set<string>());
  const tourStartTrackedRef = useRef(false);

  useEffect(() => {
    stepsSeenRef.current = stepsSeen;
  }, [stepsSeen]);

  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);

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

  const getCompletionMeta = useCallback(
    (stepIdOverride?: string) => {
      const steps = visibleSteps(manifest);
      const completion = computeCompletionState(
        steps.map((s) => ({ stepId: s.stepId, title: s.title })),
        stepsSeenRef.current,
        stepIdOverride ?? currentStepRef.current?.stepId,
      );
      return {
        progressRatio: completion.progressRatio,
        nextStepId: completion.nextStepId,
      };
    },
    [manifest],
  );

  const showInquiryBlockedMessage = useCallback(() => {
    setLocalMessages((prev) => [
      ...prev,
      {
        id: uid(),
        role: "assistant",
        content:
          "Tur henüz bitmedi — biraz daha gezdikten sonra rezervasyon talebinde bulunabilirsiniz.",
      },
    ]);
  }, []);

  const { messages: chatMessages, sendMessage: chatSendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/tour/chat" }),
    onToolCall({ toolCall }) {
      if (!isMountedRef.current) return;
      const { toolName, input } = toolCall;

      switch (toolName) {
        case "navigateTo":
          onNavigate((input as { stepId: string }).stepId);
          break;
        case "openInquiry":
          break;
        case "autoTourNext": {
          const { stepId, delayMs } = input as { stepId: string; delayMs: number };
          const meta = getCompletionMeta(currentStepRef.current?.stepId);
          const targetStepId = resolveAutoTourTargetStepId(stepId, meta.nextStepId);
          autoTourTimerRef.current = setTimeout(() => {
            if (!isMountedRef.current) return;
            onNavigate(targetStepId);
          }, delayMs || 2000);
          break;
        }
        case "endAutoTour":
          setIsAutoTour(false);
          isAutoTourRef.current = false;
          void trackEvent(
            "tour_auto_end",
            analyticsPayload(
              manifest,
              stepsSeenRef.current,
              false,
              currentStepRef.current?.stepId,
            ),
            manifest.hotelSlug,
          );
          onAutoTourEnd?.();
          break;
        case "suggestNext":
          break;
      }
    },
  });

  const isLoading = status === "submitted" || status === "streaming";

  const mappedChatMessages: GuideMessage[] = chatMessages
    .filter((m) => {
      const textParts = m.parts?.filter((p) => p.type === "text") as { text: string }[] | undefined;
      const textContent = textParts?.map((p) => p.text).join("") || "";
      return textContent !== "[HIDDEN]";
    })
    .map((m) => {
      const textParts = m.parts?.filter((p) => p.type === "text") as { text: string }[] | undefined;
      const textContent = textParts?.map((p) => p.text).join("") || "";

      const suggestNextToolPart = m.parts?.find((p) => p.type === "tool-suggestNext") as
        | { input?: { chips?: string[] } }
        | undefined;
      const chips = suggestNextToolPart?.input?.chips;

      const priceResult = extractToolOutput<AiPriceQueryResult>(m.parts, "getRoomPrice");
      const priceCards = priceResult?.ok ? priceResult.cards : undefined;
      const factCards = extractAllFactCards(m.parts);

      return {
        id: m.id,
        role: m.role as "user" | "assistant",
        content: textContent,
        chips,
        priceCards,
        factCards: factCards.length > 0 ? factCards : undefined,
      };
    });

  const allMessages = [...mappedChatMessages, ...localMessages];

  useEffect(() => {
    for (const m of chatMessages) {
      if (m.role !== "assistant") continue;

      if (!trackedOpenInquiryMessageIdsRef.current.has(m.id)) {
        const inquiryPart = m.parts?.find((p) => p.type === "tool-openInquiry") as
          | {
              type: "tool-openInquiry";
              input?: { roomSlug?: string };
              output?: { ok: boolean; blocked?: boolean };
              state?: string;
            }
          | undefined;
        if (
          inquiryPart &&
          (inquiryPart.state === "output-available" || inquiryPart.output != null)
        ) {
          trackedOpenInquiryMessageIdsRef.current.add(m.id);
          if (inquiryPart.output?.ok === false && inquiryPart.output.blocked) {
            showInquiryBlockedMessage();
          } else if (inquiryPart.output?.ok) {
            onOpenInquiry(inquiryPart.input?.roomSlug, true);
          }
        }
      }

      if (trackedToolMessageIdsRef.current.has(m.id)) continue;
      const hasPrice = m.parts?.some((p) => p.type === "tool-getRoomPrice");
      const hasFact = m.parts?.some((p) => p.type === "tool-citeFact");
      if (!hasPrice && !hasFact) continue;
      trackedToolMessageIdsRef.current.add(m.id);
      const payload = analyticsPayload(
        manifest,
        stepsSeenRef.current,
        isAutoTourRef.current,
        currentStepRef.current?.stepId,
      );
      if (hasPrice) void trackEvent("ai_tool_price", payload, manifest.hotelSlug);
      if (hasFact) void trackEvent("ai_tool_fact", payload, manifest.hotelSlug);
    }
  }, [chatMessages, manifest, onOpenInquiry, showInquiryBlockedMessage]);

  const trigger = useCallback(
    async (reason: TriggerReason, userMessage?: string, stepIdOverride?: string) => {
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
        completionMeta: getCompletionMeta(currentStepId),
      };

      if (reason === "tourStart" && !tourStartTrackedRef.current) {
        tourStartTrackedRef.current = true;
        void trackEvent(
          "tour_start",
          analyticsPayload(manifest, stepsSeen, isAutoTourRef.current, currentStepId),
          manifest.hotelSlug,
        );
      }

      if (reason === "userMessage" && userMessage) {
        lastUserMessageRef.current = userMessage;
        await chatSendMessage({ text: userMessage }, { body });
      } else {
        await chatSendMessage({ text: "[HIDDEN]" }, { body });
        setNudgeCount((n) => n + 1);
      }
    },
    [chatSendMessage, currentStep?.stepId, getCompletionMeta, manifest, maxNudges, stepsSeen],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      if (isAutoTourRef.current) {
        if (autoTourTimerRef.current) clearTimeout(autoTourTimerRef.current);
        setIsAutoTour(false);
        isAutoTourRef.current = false;
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

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      if (!isMountedRef.current || isAutoTourRef.current) return;
      void trigger("idle");
    }, idleTimeoutMs);
  }, [trigger, idleTimeoutMs]);

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
      void trigger(getStepEndTriggerReason(isAutoTourRef.current), undefined, stepId);
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

  const startAutoTour = useCallback(() => {
    if (autoTourTimerRef.current) clearTimeout(autoTourTimerRef.current);
    isAutoTourRef.current = true;
    setIsAutoTour(true);
    firstStepStartSkippedRef.current = true;

    const firstVisibleStep = visibleSteps(manifest)[0];

    if (firstVisibleStep) {
      onNavigate(firstVisibleStep.stepId);
      void trackEvent(
        "tour_auto_start",
        analyticsPayload(manifest, stepsSeenRef.current, true, firstVisibleStep.stepId),
        manifest.hotelSlug,
      );
      void trigger("tourStart", undefined, firstVisibleStep.stepId);
    }
  }, [manifest, onNavigate, trigger]);

  const stopAutoTour = useCallback(() => {
    if (autoTourTimerRef.current) clearTimeout(autoTourTimerRef.current);
    setIsAutoTour(false);
    isAutoTourRef.current = false;
    void trackEvent(
      "tour_auto_end",
      analyticsPayload(manifest, stepsSeenRef.current, false, currentStep?.stepId),
      manifest.hotelSlug,
    );
    setLocalMessages((prev) => [
      ...prev,
      {
        id: uid(),
        role: "assistant",
        content: "Otomatik tur durduruldu. Devam etmek ister misiniz?",
        chips: ["Turu yeniden başlat", "Serbest gez"],
      },
    ]);
  }, [currentStep?.stepId, manifest]);

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

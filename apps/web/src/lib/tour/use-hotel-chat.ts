"use client";

import { useCallback, useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { detectLanguageHint } from "@/lib/ai/language-detect";
import { HOTEL_PAGE_STEP_ID, HOTEL_PAGE_TOUR_ID } from "@/lib/ai/hotel-page-chat";
import { toGuideMessages, type GuideMessage } from "@/lib/tour/use-tour-guide";
import { getVisitId } from "@/lib/visit-client";

interface UseHotelChatOptions {
  hotelSlug: string;
  /** Pazarlama sayfasındaki "Kendin dene" sohbeti — sunucu ayrı, sıkı bir sınır uygular. */
  demo?: boolean;
}

/** Rehberin önerdiği talep formu — misafir isterse açar (otomatik yönlendirme yok). */
export interface InquiryOffer {
  roomSlug?: string;
}

/**
 * Otel sayfası sohbeti — turdaki rehberle aynı uç nokta ve aynı motor.
 * Tur rehberinden farkı: yalnız misafir yazdığında istek gider; açılış
 * anlatımı, boşta dürtme ve otomatik tur yoktur.
 */
export function useHotelChat({ hotelSlug, demo = false }: UseHotelChatOptions) {
  const [errorMessages, setErrorMessages] = useState<GuideMessage[]>([]);
  const [detectedLanguage, setDetectedLanguage] = useState<string | undefined>(undefined);

  const { messages: chatMessages, sendMessage: chatSendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/tour/chat" }),
    onError(error) {
      const raw = error?.message ?? "";
      const isRateLimited = raw.includes("429") || raw.toLowerCase().includes("rate");
      setErrorMessages((prev) => [
        ...prev,
        {
          id: `hata-${Date.now()}`,
          role: "assistant",
          content: isRateLimited
            ? "Çok fazla mesaj gönderildi — lütfen kısa bir süre bekleyip tekrar deneyin."
            : "Rehber şu an yanıt veremiyor. Birazdan tekrar deneyin ya da talep formundan bize yazın.",
        },
      ]);
    },
  });

  const isThinking = status === "submitted" || status === "streaming";

  // Rehber talep formunu önerdiyse (openInquiry aracı başarılı) son öneri.
  // Turda bu araç forma yönlendirir; otel sayfasında misafir sohbetin
  // ortasında sayfadan atılmasın diye yalnız bir düğme gösterilir.
  const inquiryOffer = useMemo<InquiryOffer | null>(() => {
    const last = chatMessages[chatMessages.length - 1];
    if (last?.role !== "assistant") return null;
    const part = last.parts?.find((p) => p.type === "tool-openInquiry") as
      | { input?: { roomSlug?: string }; output?: { ok?: boolean } }
      | undefined;
    return part?.output?.ok ? { roomSlug: part.input?.roomSlug } : null;
  }, [chatMessages]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isThinking) return;
      // Eski hata notu yeni sorunun altında asılı kalmasın.
      setErrorMessages([]);
      const hint = detectLanguageHint(trimmed);
      if (hint === "tr" || hint === "en") setDetectedLanguage(hint);
      await chatSendMessage(
        { text: trimmed },
        {
          body: {
            hotelSlug,
            tourId: HOTEL_PAGE_TOUR_ID,
            currentStepId: HOTEL_PAGE_STEP_ID,
            stepsSeen: [HOTEL_PAGE_STEP_ID],
            triggerReason: "userMessage",
            isAutoTour: false,
            browserLocale: typeof navigator !== "undefined" ? navigator.language : undefined,
            visitId: getVisitId(),
            ...(demo ? { demo: true } : {}),
          },
        },
      );
    },
    [chatSendMessage, demo, hotelSlug, isThinking],
  );

  return {
    messages: [...toGuideMessages(chatMessages), ...errorMessages],
    /** Misafirin gönderdiği soru sayısı (demo sınırı için). */
    questionCount: chatMessages.filter((m) => m.role === "user").length,
    isThinking,
    detectedLanguage,
    inquiryOffer,
    sendMessage,
  };
}

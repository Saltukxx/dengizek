"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { IconMessageCircle } from "@tabler/icons-react";
import type { HotelChatPanelProps } from "@/components/guest/hotel-chat-panel";
import { DEMO_QUESTION_LIMIT } from "@/lib/ai/hotel-page-chat";

// Sohbet kodu (AI SDK, Mantine) yalnız ziyaretçi denemeyi başlatınca indirilir.
const HotelChatPanel = dynamic<HotelChatPanelProps>(() => import("@/components/guest/hotel-chat-panel"), {
  ssr: false,
  loading: () => <div className="ttc-loading">Rehber hazırlanıyor…</div>,
});

export interface ShowcaseTryChatProps {
  hotelSlug: string;
  hotelName: string;
  starterQuestions: string[];
  /** Yüzeyin talep formu ve otel sayfası yolları. */
  inquiryPath: string;
  hotelHref: string;
}

/**
 * "Kendin dene" — otel sayfasındaki gerçek rehber, sayfaya gömülü.
 * Ziyaretçi başına {DEMO_QUESTION_LIMIT} soru; sunucu da aynı sınırı uygular.
 */
export function ShowcaseTryChat({ hotelSlug, hotelName, starterQuestions, inquiryPath, hotelHref }: ShowcaseTryChatProps) {
  const [started, setStarted] = useState(false);

  if (!started) {
    return (
      <div className="ttc-start">
        <p className="ttc-start-title">{hotelName} rehberine sorun</p>
        <p className="ttc-start-body">
          Cevaplar otelin yayındaki bilgilerinden gelir. {DEMO_QUESTION_LIMIT} soru hakkınız var.
        </p>
        <button type="button" className="er-btn er-btn-primary" onClick={() => setStarted(true)}>
          <IconMessageCircle size={18} aria-hidden />
          Sohbeti başlat
        </button>
      </div>
    );
  }

  return (
    <div className="ttc-panel">
      <HotelChatPanel
        hotelSlug={hotelSlug}
        hotelName={hotelName}
        inquiryPath={inquiryPath}
        starterQuestions={starterQuestions}
        demo
        questionLimit={DEMO_QUESTION_LIMIT}
        continueHref={hotelHref}
      />
    </div>
  );
}

"use client";

// Katmanlı Mantine stilleri: sitenin kendi CSS'i (katmansız) her zaman üstün
// kalır, sohbet açılınca sayfanın görünümü değişmez.
import "@mantine/core/styles.layer.css";
import Link from "next/link";
import { CloseButton, MantineProvider, Stack, Text } from "@mantine/core";
import { appTheme } from "@/theme";
import { TourGuidePanel } from "@/components/tour-player/TourGuidePanel";
import { TourGuideChips } from "@/components/tour-player/tour-guide-chips";
import { HOTEL_PAGE_TOUR_ID } from "@/lib/ai/hotel-page-chat";
import { useHotelChat } from "@/lib/tour/use-hotel-chat";
import { getVisitId } from "@/lib/visit-client";

export interface HotelChatPanelProps {
  hotelSlug: string;
  hotelName: string;
  /** Talep formunun yolu — yaz ve kış yüzeyinde farklı. */
  inquiryPath: string;
  /** Otelin verisinden üretilen hazır sorular (bkz. hotelChatStarters). */
  starterQuestions: string[];
  /** Verilmezse panelde kapatma düğmesi gösterilmez (sayfaya gömülü kullanım). */
  onClose?: () => void;
  /** "Kendin dene" sohbeti: sunucu tarafında demo sınırı uygulanır. */
  demo?: boolean;
  /** Bu kadar sorudan sonra yeni soru gönderilmez, otel sayfasına yönlendirilir. */
  questionLimit?: number;
  /** Sınır dolunca gösterilen "sohbete devam" bağlantısı. */
  continueHref?: string;
}

/**
 * Otel sayfası sohbet paneli — turdaki rehber paneliyle aynı bileşen, aynı
 * motor. Ayrı dosyada durur ki ağır sohbet kodu yalnız açılınca yüklensin.
 */
export default function HotelChatPanel({
  hotelSlug,
  hotelName,
  inquiryPath,
  starterQuestions,
  onClose,
  demo = false,
  questionLimit,
  continueHref,
}: HotelChatPanelProps) {
  const { messages, isThinking, detectedLanguage, inquiryOffer, sendMessage: send, questionCount } = useHotelChat({
    hotelSlug,
    demo,
  });
  const limitReached = questionLimit !== undefined && questionCount >= questionLimit;
  const sendMessage = (text: string) => (limitReached ? Promise.resolve() : send(text));

  const inquiryHref = (() => {
    const params = new URLSearchParams({ hotel: hotelSlug, source: "hotel_chat" });
    if (inquiryOffer?.roomSlug) params.set("room", inquiryOffer.roomSlug);
    return `${inquiryPath}?${params.toString()}`;
  })();

  return (
    // Misafir sayfaları Mantine'siz render edilir; sağlayıcı yalnız sohbetle gelir.
    <MantineProvider forceColorScheme="light" theme={appTheme}>
    <TourGuidePanel
      messages={messages}
      isThinking={isThinking}
      isAutoTour={false}
      hotelName={hotelName}
      detectedLanguage={detectedLanguage}
      onSendMessage={(text) => void sendMessage(text)}
      onChipClick={(chip) => void sendMessage(chip)}
      headerAction={onClose ? <CloseButton onClick={onClose} aria-label="Sohbeti kapat" /> : undefined}
      aboveInput={
        limitReached && !isThinking ? (
          <Text size="sm" style={{ color: "var(--er-text-muted)" }}>
            Deneme hakkınız doldu.{" "}
            {continueHref ? (
              <Link href={continueHref} style={{ color: "var(--er-primary)", fontWeight: 600 }}>
                Sohbete {hotelName} sayfasında devam edin →
              </Link>
            ) : null}
          </Text>
        ) : inquiryOffer && !isThinking ? (
          <Link href={inquiryHref} className="er-btn er-btn-cta er-btn-block" style={{ minHeight: 40 }}>
            Talep formunu aç
          </Link>
        ) : undefined
      }
      emptyState={
        <Stack gap={12} py="md">
          <Text size="sm" style={{ color: "var(--er-text-muted)" }}>
            {hotelName} hakkında merak ettiğinizi sorun. Cevaplar otelin yayındaki bilgilerinden gelir.
          </Text>
          <TourGuideChips chips={starterQuestions} onChipClick={(q) => void sendMessage(q)} />
        </Stack>
      }
      onFeedback={(input) => {
        // Değerlendirme kaybolursa misafir deneyimi etkilenmez.
        void fetch("/api/tour/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hotelSlug, tourId: HOTEL_PAGE_TOUR_ID, visitId: getVisitId(), ...input }),
        }).catch(() => {});
      }}
    />
    </MantineProvider>
  );
}

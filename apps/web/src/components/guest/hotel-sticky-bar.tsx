"use client";

import { useEffect, useState } from "react";
import { IconMessageCircle } from "@tabler/icons-react";
import { OpenHotelChatButton } from "./hotel-chat";
import { StayLink } from "./stay-calculator";

/**
 * Otel sayfası mobil eylem çubuğu — sayfa biraz kaydırılınca alttan belirir:
 * fiyat bilgisi, rehbere soru ve talep. Masaüstünde yapışkan rezervasyon
 * paneli aynı işi gördüğü için gizlidir.
 */
export function HotelStickyBar({
  priceText,
  priceNote,
  inquiryHref,
}: {
  priceText: string;
  /** Fiyatın altında küçük not — "14 Kasım'dan itibaren". */
  priceNote?: string | null;
  inquiryHref: string;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 520);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div className="er-hotel-bar" data-visible={visible || undefined} aria-hidden={!visible}>
      <p className="er-hotel-bar-price">
        {priceText}
        {priceNote && <span className="er-hotel-bar-note">{priceNote}</span>}
      </p>
      <OpenHotelChatButton className="er-hotel-bar-ask">
        <IconMessageCircle size={18} aria-hidden />
        Sor
      </OpenHotelChatButton>
      <StayLink href={inquiryHref} className="er-btn er-btn-cta er-hotel-bar-cta">
        Talep Gönder
      </StayLink>
    </div>
  );
}

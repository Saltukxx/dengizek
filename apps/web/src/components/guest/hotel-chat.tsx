"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { IconBrandWhatsapp, IconMessageCircle, IconPhone, IconView360 } from "@tabler/icons-react";
import type { HotelChatPanelProps } from "./hotel-chat-panel";
import { trackEvent } from "@/lib/analytics-client";

/** Sayfanın başka yerinden (ör. rezervasyon panelindeki bağlantı) sohbeti açar. */
const OPEN_EVENT = "otel-sohbet:ac";

// Sohbet kodu (AI SDK, panel) yalnız misafir sohbeti açınca indirilir.
const HotelChatPanel = dynamic<HotelChatPanelProps>(() => import("./hotel-chat-panel"), { ssr: false });

/** Sağ alttaki sabit düğmeler: tur, WhatsApp, telefon. Boş olan çıkmaz. */
export interface HotelDockActions {
  tourHref?: string | null;
  tel?: string | null;
  whatsapp?: string | null;
}

/**
 * Otel sayfası sohbeti — sağ altta sabit düğme grubu (video tur, WhatsApp,
 * telefon, "Soru sorun"); "Soru sorun" rehber panelini açar.
 */
export function HotelChat({ actions = {}, ...props }: Omit<HotelChatPanelProps, "onClose"> & { actions?: HotelDockActions }) {
  const [open, setOpen] = useState(false);
  // Bir kez açıldıktan sonra panel bağlı kalır: kapatıp açınca sohbet kaybolmaz.
  const [mounted, setMounted] = useState(false);
  const { hotelSlug } = props;

  const openChat = useCallback(
    (from: "dugme" | "panel") => {
      setMounted(true);
      setOpen(true);
      void trackEvent("hotel_chat_open", { from }, hotelSlug);
    },
    [hotelSlug],
  );

  useEffect(() => {
    const onOpen = () => openChat("panel");
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [openChat]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {!open && (
        <div className="er-dock" role="group" aria-label="Hızlı eylemler">
          {actions.whatsapp || actions.tel ? (
            <div className="er-dock-contact">
              {actions.whatsapp ? (
                <a
                  href={actions.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="er-dock-icon er-dock-wa"
                  aria-label="WhatsApp ile yazın"
                  title="WhatsApp ile yazın"
                  onClick={() => void trackEvent("hotel_contact_click", { kanal: "whatsapp" }, hotelSlug)}
                >
                  <IconBrandWhatsapp size={24} aria-hidden />
                </a>
              ) : null}
              {actions.tel ? (
                <a
                  href={actions.tel}
                  className="er-dock-icon er-dock-tel"
                  aria-label="Oteli arayın"
                  title="Oteli arayın"
                  onClick={() => void trackEvent("hotel_contact_click", { kanal: "telefon" }, hotelSlug)}
                >
                  <IconPhone size={22} aria-hidden />
                </a>
              ) : null}
            </div>
          ) : null}
          {actions.tourHref ? (
            <Link href={actions.tourHref} className="er-dock-pill er-dock-tour">
              <IconView360 size={20} aria-hidden />
              Otel turunu başlat
            </Link>
          ) : null}
          <button
            type="button"
            className="er-dock-pill er-chat-launcher"
            onClick={() => openChat("dugme")}
            aria-haspopup="dialog"
          >
            <IconMessageCircle size={20} aria-hidden />
            Soru sorun
          </button>
        </div>
      )}
      {mounted && (
        <div
          className="er-chat-sheet"
          role="dialog"
          aria-label={`${props.hotelName} rehberi`}
          hidden={!open}
        >
          <HotelChatPanel {...props} onClose={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}

/** Sohbeti açan satır içi bağlantı — sunucu bileşenlerinden kullanılabilir. */
export function OpenHotelChatButton({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}>
      {children}
    </button>
  );
}

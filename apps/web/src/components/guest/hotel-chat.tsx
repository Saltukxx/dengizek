"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { IconMessageCircle } from "@tabler/icons-react";
import type { HotelChatPanelProps } from "./hotel-chat-panel";
import { trackEvent } from "@/lib/analytics-client";

/** Sayfanın başka yerinden (ör. rezervasyon panelindeki bağlantı) sohbeti açar. */
const OPEN_EVENT = "otel-sohbet:ac";

// Sohbet kodu (AI SDK, panel) yalnız misafir sohbeti açınca indirilir.
const HotelChatPanel = dynamic<HotelChatPanelProps>(() => import("./hotel-chat-panel"), { ssr: false });

/**
 * Otel sayfası sohbeti — sağ altta açma düğmesi, tıklanınca rehber paneli.
 */
export function HotelChat(props: Omit<HotelChatPanelProps, "onClose">) {
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
        <button
          type="button"
          className="er-chat-launcher"
          onClick={() => openChat("dugme")}
          aria-haspopup="dialog"
        >
          <IconMessageCircle size={20} aria-hidden />
          Soru sorun
        </button>
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

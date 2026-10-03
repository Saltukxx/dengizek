"use client";

import { showNotification } from "@mantine/notifications";
import { TourPlayer } from "@/components/tour-player/TourPlayer";
import type { TourManifest } from "@/lib/schemas/tour-manifest";
import { guestPaths } from "@/lib/guest-surface";

type Props = {
  manifest: TourManifest;
  hotelSlug: string;
  hotelName: string;
  /** ?room= bağlamı — talep formunu ön doldurur ve geri bağlantısını odaya çevirir. */
  contextRoomSlug?: string;
  surface?: "yaz" | "kis";
};

export function TourRouteClient({
  manifest,
  hotelSlug,
  hotelName,
  contextRoomSlug,
  surface = "yaz",
}: Props) {
  const paths = guestPaths(surface);
  const backHref = contextRoomSlug
    ? paths.room(hotelSlug, contextRoomSlug)
    : paths.hotel(hotelSlug);

  return (
    <TourPlayer
      manifest={manifest}
      hotelName={hotelName}
      surface={surface}
      contextRoomSlug={contextRoomSlug}
      backHref={backHref}
      backLabel={
        contextRoomSlug
          ? "Oda sayfasına dön"
          : surface === "kis"
            ? "Kış oteline dön"
            : `${hotelName} sayfasına dön`
      }
      onComplete={() => {
        showNotification({
          title: "Tur bitti",
          message: "Otele dönebilir veya bir talep gönderebilirsiniz.",
          color: "teal",
        });
      }}
    />
  );
}

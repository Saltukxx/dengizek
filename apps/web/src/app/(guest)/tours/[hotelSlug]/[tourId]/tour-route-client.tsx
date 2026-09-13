"use client";

import { showNotification } from "@mantine/notifications";
import { TourPlayer } from "@/components/tour-player/TourPlayer";
import type { TourManifest } from "@/lib/schemas/tour-manifest";

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
  const backHref =
    surface === "kis"
      ? `/kis/oteller/${hotelSlug}`
      : contextRoomSlug
        ? `/hotels/${hotelSlug}/rooms/${contextRoomSlug}`
        : `/hotels/${hotelSlug}`;

  return (
    <TourPlayer
      manifest={manifest}
      hotelName={hotelName}
      surface={surface}
      contextRoomSlug={contextRoomSlug}
      backHref={backHref}
      backLabel={surface === "kis" ? "Kış oteline dön" : contextRoomSlug ? "Oda sayfasına dön" : `${hotelName} sayfasına dön`}
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

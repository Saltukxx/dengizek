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
};

export function TourRouteClient({ manifest, hotelSlug, hotelName, contextRoomSlug }: Props) {
  return (
    <TourPlayer
      manifest={manifest}
      contextRoomSlug={contextRoomSlug}
      backHref={contextRoomSlug ? `/hotels/${hotelSlug}/rooms/${contextRoomSlug}` : `/hotels/${hotelSlug}`}
      backLabel={contextRoomSlug ? "Oda sayfasına dön" : `${hotelName} sayfasına dön`}
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

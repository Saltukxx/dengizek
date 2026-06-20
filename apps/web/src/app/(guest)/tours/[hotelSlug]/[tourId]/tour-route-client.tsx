"use client";

import { showNotification } from "@mantine/notifications";
import { TourPlayer } from "@/components/tour-player/TourPlayer";
import type { TourManifest } from "@/lib/schemas/tour-manifest";

type Props = { manifest: TourManifest; hotelSlug: string; hotelName: string };

export function TourRouteClient({ manifest, hotelSlug, hotelName }: Props) {
  return (
    <TourPlayer
      manifest={manifest}
      backHref={`/hotels/${hotelSlug}`}
      backLabel={`${hotelName} sayfasına dön`}
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

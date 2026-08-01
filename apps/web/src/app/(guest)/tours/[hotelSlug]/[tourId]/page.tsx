import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTourManifest } from "@/lib/mocks/hotels";
import { getPublishedHotelBySlug } from "@/lib/hotels-repo";
import { TourRouteClient } from "./tour-route-client";

type PageProps = {
  params: Promise<{ hotelSlug: string; tourId: string }>;
  /** ?room= — hangi oda bağlamından gelindiği (oda sayfasındaki tur bağlantısı). */
  searchParams: Promise<{ room?: string }>;
};

export async function generateMetadata({ params }: Pick<PageProps, "params">): Promise<Metadata> {
  const { hotelSlug } = await params;
  const hotel = await getPublishedHotelBySlug(hotelSlug);
  return {
    title: hotel ? `${hotel.name} — Video turu` : "Video turu",
    description: "Etkileşimli video turu (demo).",
  };
}

export default async function TourPage({ params, searchParams }: PageProps) {
  const { hotelSlug, tourId } = await params;
  const { room } = await searchParams;

  let manifest;
  try {
    manifest = await getTourManifest(hotelSlug, tourId);
  } catch {
    notFound();
  }

  const hotel = await getPublishedHotelBySlug(hotelSlug);
  if (!manifest || !hotel) notFound();

  return (
    <Suspense
      fallback={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100dvh",
            background: "var(--lux-bg)",
            color: "var(--lux-muted)",
            fontFamily: "var(--lux-font-sans)",
            fontSize: 14,
            letterSpacing: "0.1em",
          }}
        >
          Tur yükleniyor…
        </div>
      }
    >
      <TourRouteClient
        manifest={manifest}
        hotelSlug={hotelSlug}
        hotelName={hotel.name}
        contextRoomSlug={room}
      />
    </Suspense>
  );
}

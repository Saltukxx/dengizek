import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTourManifest } from "@/lib/mocks/hotels";
import { getPublishedHotelBySlug } from "@/lib/hotels-repo";
import { TourRouteClient } from "./tour-route-client";

type PageProps = {
  params: Promise<{ hotelSlug: string; tourId: string }>;
  /** ?room= oda bağlamı; ?surface=kis kış vitrininin tema ve dönüş bağlamı. */
  searchParams: Promise<{ room?: string; surface?: string }>;
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
  const { room, surface: requestedSurface } = await searchParams;
  const surface = requestedSurface === "kis" ? "kis" : "yaz";

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
            background: "var(--er-bg)",
            color: "var(--er-text-muted)",
            fontFamily: "var(--er-font-sans)",
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
        surface={surface}
      />
    </Suspense>
  );
}

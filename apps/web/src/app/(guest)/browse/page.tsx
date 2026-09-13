import type { Metadata } from "next";
import { HotelBrowse } from "@/components/guest/hotel-browse";

/** Yaz yüzeyinde öne çıkan olanaklar — sahil ve havuz odaklı. */
const SUMMER_AMENITIES = [
  { key: "acik-havuz", label: "Açık havuz" },
  { key: "spa-merkezi", label: "Spa & Wellness" },
  { key: "ozel-plaj", label: "Özel plaj" },
  { key: "her-sey-dahil", label: "Her şey dahil" },
] as const;

export const metadata: Metadata = {
  title: "Otelleri keşfet",
  description: "Etkileşimli video turlu otelleri filtreleyin ve bulun.",
};

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return (
    <HotelBrowse
      basePath="/browse"
      searchParams={await searchParams}
      heading="Video turlu oteller"
      featuredAmenities={SUMMER_AMENITIES}
      analyticsPage="browse"
    />
  );
}

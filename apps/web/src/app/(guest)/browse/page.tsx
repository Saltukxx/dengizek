import type { Metadata } from "next";
import { HotelBrowse } from "@/components/guest/hotel-browse";
import { guestShareMeta } from "@/lib/guest-seo";

/**
 * Yaz yüzeyinde öne çıkan olanaklar. Envanterde bulunmayanlar listede
 * kendiliğinden gizlenir (bkz. HotelBrowse).
 */
const SUMMER_AMENITIES = [
  { key: "termal-havuz", label: "Termal havuz" },
  { key: "ozel-plaj", label: "Özel plaj" },
  { key: "hamam", label: "Hamam" },
  { key: "cocuk-havuzu", label: "Çocuk havuzu" },
  { key: "acik-havuz", label: "Açık havuz" },
  { key: "spa-merkezi", label: "Spa merkezi" },
  { key: "her-sey-dahil", label: "Her şey dahil" },
] as const;

export const metadata: Metadata = guestShareMeta({
  title: "Otelleri keşfet",
  description: "Otelleri şehir, olanak ve fiyata göre filtreleyin; video turu olanları gezin.",
});

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return (
    <HotelBrowse
      basePath="/browse"
      searchParams={await searchParams}
      heading="Oteller"
      featuredAmenities={SUMMER_AMENITIES}
      season="yaz"
      analyticsPage="browse"
    />
  );
}

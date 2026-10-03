import type { Metadata } from "next";
import { HotelBrowse } from "@/components/guest/hotel-browse";
import { guestShareMeta } from "@/lib/guest-seo";

/**
 * Kış yüzeyinde öne çıkan olanaklar — kayak sonrası ısınma ve kapalı
 * alan odaklı. Kataloğa kayak merkezi/ekipman anahtarları eklendiğinde
 * bu liste onlarla genişletilir.
 */
const WINTER_AMENITIES = [
  { key: "spa-merkezi", label: "Spa & Wellness" },
  { key: "kapali-havuz", label: "Kapalı havuz" },
  { key: "hamam", label: "Hamam" },
  { key: "sauna", label: "Sauna" },
] as const;

export const metadata: Metadata = guestShareMeta({
  title: "Kış otelleri",
  description: "Kayak ve kış tatili otellerini video turlarıyla keşfedin.",
});

export default async function WinterBrowsePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return (
    <HotelBrowse
      basePath="/kis/oteller"
      searchParams={await searchParams}
      heading="Kış tatili otelleri"
      featuredAmenities={WINTER_AMENITIES}
      season="kis"
      analyticsPage="kis-browse"
    />
  );
}

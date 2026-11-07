import type { Metadata } from "next";
import { HotelBrowse } from "@/components/guest/hotel-browse";
import { guestShareMeta } from "@/lib/guest-seo";

/** Termal yüzeyinde öne çıkan olanaklar — su ve arınma odaklı. */
const THERMAL_AMENITIES = [
  { key: "termal-havuz", label: "Termal havuz" },
  { key: "kapali-havuz", label: "Kapalı havuz" },
  { key: "spa-merkezi", label: "Spa & Wellness" },
  { key: "hamam", label: "Hamam" },
  { key: "sauna", label: "Sauna" },
  { key: "cocuk-havuzu", label: "Çocuk havuzu" },
] as const;

export const metadata: Metadata = guestShareMeta({
  title: "Termal oteller",
  description: "Termal havuzlu ve kaplıcalı otelleri video turlarıyla keşfedin.",
});

export default async function ThermalBrowsePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return (
    <HotelBrowse
      basePath="/termal/oteller"
      searchParams={await searchParams}
      heading="Termal oteller"
      featuredAmenities={THERMAL_AMENITIES}
      season="termal"
      analyticsPage="termal-browse"
    />
  );
}

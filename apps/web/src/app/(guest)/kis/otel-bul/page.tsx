import type { Metadata } from "next";
import { HotelFinder, type HotelFinderProps } from "@/components/guest/hotel-finder";
import { guestShareMeta } from "@/lib/guest-seo";

export const metadata: Metadata = guestShareMeta({
  title: "Kış oteli bul",
  description: "İstediğiniz özellikleri yazın, size uyan otelleri bulalım.",
});

export default function HotelFinderPage({ searchParams }: Pick<HotelFinderProps, "searchParams">) {
  return <HotelFinder searchParams={searchParams} surface="kis" />;
}

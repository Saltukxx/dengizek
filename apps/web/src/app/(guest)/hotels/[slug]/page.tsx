import type { Metadata } from "next";
import {
  HotelDetailPage,
  type HotelDetailPageProps,
  generateHotelMetadata,
} from "@/components/guest/hotel-detail-page";

// Ekran yaz ve kış rotalarında ortak (bkz. kis/oteller/[slug]); Next sayfa
// dosyası ek dışa aktarım kabul etmediği için bileşen ayrı dosyada.
type Props = Pick<HotelDetailPageProps, "params">;

export async function generateMetadata(props: Props): Promise<Metadata> {
  return generateHotelMetadata(props);
}

export default async function HotelPage(props: Props) {
  return <HotelDetailPage {...props} />;
}

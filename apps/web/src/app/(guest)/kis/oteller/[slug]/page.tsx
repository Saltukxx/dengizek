import {
  HotelDetailPage,
  type HotelDetailPageProps,
  generateHotelMetadata,
} from "../../../hotels/[slug]/page";

export async function generateMetadata(props: HotelDetailPageProps) {
  return generateHotelMetadata(props, "kis");
}

export default async function WinterHotelPage(props: HotelDetailPageProps) {
  return <HotelDetailPage {...props} surface="kis" />;
}

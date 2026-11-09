import {
  HotelDetailPage,
  type HotelDetailPageProps,
  generateHotelMetadata,
} from "@/components/guest/hotel-detail-page";

type Props = Pick<HotelDetailPageProps, "params">;

export async function generateMetadata(props: Props) {
  return generateHotelMetadata(props, "kis");
}

export default async function WinterHotelPage(props: Props) {
  return <HotelDetailPage {...props} surface="kis" />;
}

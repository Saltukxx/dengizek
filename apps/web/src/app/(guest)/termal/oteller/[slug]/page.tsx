import {
  HotelDetailPage,
  type HotelDetailPageProps,
  generateHotelMetadata,
} from "@/components/guest/hotel-detail-page";

type Props = Pick<HotelDetailPageProps, "params">;

export async function generateMetadata(props: Props) {
  return generateHotelMetadata(props, "termal");
}

export default async function ThermalHotelPage(props: Props) {
  return <HotelDetailPage {...props} surface="termal" />;
}

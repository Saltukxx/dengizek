import { HotelDetailPanel } from "@/components/admin/hotel-detail-panel";

type PageProps = { params: Promise<{ hotelId: string }> };

export default async function AdminHotelDetailPage({ params }: PageProps) {
  const { hotelId } = await params;
  return <HotelDetailPanel hotelId={hotelId} />;
}

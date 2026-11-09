import { RoomPage, type RoomPageProps, generateRoomMetadata } from "@/components/guest/room-page";

// Next sayfa prop'u yalnız params/searchParams kabul eder; yüzey ayrı verilir.
type Props = Pick<RoomPageProps, "params">;

export async function generateMetadata(props: Props) {
  return generateRoomMetadata(props, "kis");
}

export default function WinterRoomPage(props: Props) {
  return <RoomPage {...props} surface="kis" />;
}

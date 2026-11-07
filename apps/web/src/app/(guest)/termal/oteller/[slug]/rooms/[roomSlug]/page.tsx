import { RoomPage, type RoomPageProps, generateRoomMetadata } from "@/components/guest/room-page";

// Next sayfa prop'u yalnız params/searchParams kabul eder; yüzey ayrı verilir.
type Props = Pick<RoomPageProps, "params">;

export async function generateMetadata(props: Props) {
  return generateRoomMetadata(props, "termal");
}

export default function ThermalRoomPage(props: Props) {
  return <RoomPage {...props} surface="termal" />;
}

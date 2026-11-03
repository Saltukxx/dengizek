import { RoomPage, type RoomPageProps, generateRoomMetadata } from "@/components/guest/room-page";

// Next sayfa prop'u yalnız params/searchParams kabul eder; yüzey ayrı verilir.
type Props = Pick<RoomPageProps, "params">;

export async function generateMetadata(props: Props) {
  return generateRoomMetadata(props);
}

export default function SummerRoomPage(props: Props) {
  return <RoomPage {...props} />;
}

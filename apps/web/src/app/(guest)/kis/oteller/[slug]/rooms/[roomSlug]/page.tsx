import { RoomPage, type RoomPageProps, generateRoomMetadata } from "@/components/guest/room-page";

export async function generateMetadata(props: RoomPageProps) {
  return generateRoomMetadata(props, "kis");
}

export default function WinterRoomPage(props: RoomPageProps) {
  return <RoomPage {...props} surface="kis" />;
}

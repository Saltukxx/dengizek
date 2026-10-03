import { RoomPage, type RoomPageProps, generateRoomMetadata } from "@/components/guest/room-page";

export async function generateMetadata(props: RoomPageProps) {
  return generateRoomMetadata(props);
}

export default function SummerRoomPage(props: RoomPageProps) {
  return <RoomPage {...props} />;
}

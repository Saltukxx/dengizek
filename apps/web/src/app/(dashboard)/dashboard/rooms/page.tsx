import { Stack, Text, Title } from "@mantine/core";
import { RoomsManager } from "@/components/dashboard/rooms-manager";

export default function DashboardRoomsPage() {
  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Odalar</Title>
        <Text c="dimmed" size="sm">
          Oda tiplerini, kapasiteleri, olanakları ve fiyatları yönetin.
        </Text>
      </div>
      <RoomsManager />
    </Stack>
  );
}

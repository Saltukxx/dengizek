import { Stack, Text, Title } from "@mantine/core";
import { ToursList } from "@/components/dashboard/tours-list";

export default function DashboardToursPage() {
  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Turlar</Title>
        <Text c="dimmed" size="sm">
          Tur oluşturun, adımları düzenleyin ve incelemeye gönderin.
        </Text>
      </div>
      <ToursList />
    </Stack>
  );
}

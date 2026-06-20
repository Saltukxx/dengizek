import { Stack, Text, Title } from "@mantine/core";
import { AvailabilityManager } from "@/components/dashboard/availability-manager";

export default function DashboardAvailabilityPage() {
  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Müsaitlik</Title>
        <Text c="dimmed" size="sm">
          Sezon notları ve kapalı dönem bilgilendirmeleri.
        </Text>
      </div>
      <AvailabilityManager />
    </Stack>
  );
}

import { Stack, Text, Title } from "@mantine/core";
import { RatePlansManager } from "@/components/dashboard/rate-plans-manager";

export default function DashboardRatePlansPage() {
  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Fiyat planları</Title>
        <Text c="dimmed" size="sm">
          Oda fiyatlandırma planlarını ve varsayılan planı yönetin.
        </Text>
      </div>
      <RatePlansManager />
    </Stack>
  );
}

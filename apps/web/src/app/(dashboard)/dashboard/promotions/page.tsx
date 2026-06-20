import { Stack, Text, Title } from "@mantine/core";
import { PromotionsManager } from "@/components/dashboard/promotions-manager";

export default function DashboardPromotionsPage() {
  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Kampanyalar</Title>
        <Text c="dimmed" size="sm">
          İndirim ve promosyon kurallarını yönetin.
        </Text>
      </div>
      <PromotionsManager />
    </Stack>
  );
}

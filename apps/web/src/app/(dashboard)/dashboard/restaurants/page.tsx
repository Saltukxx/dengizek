import { Stack, Text, Title } from "@mantine/core";
import { RestaurantsManager } from "@/components/dashboard/restaurants-manager";

export default function DashboardRestaurantsPage() {
  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Restoranlar</Title>
        <Text c="dimmed" size="sm">
          Restoranlarınızı ve menülerini (bölümler, ürünler, fiyatlar) yönetin.
        </Text>
      </div>
      <RestaurantsManager />
    </Stack>
  );
}

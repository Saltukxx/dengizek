import { Stack, Text, Title } from "@mantine/core";
import { SeasonalPricesManager } from "@/components/dashboard/seasonal-prices-manager";

export default function DashboardSeasonalPricesPage() {
  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Dönemsel fiyatlar</Title>
        <Text c="dimmed" size="sm">
          Tüm odalar için dönemsel gecelik fiyatları tablo halinde yönetin; kişi sayısına göre
          fiyat, toplu ekleme ve silme yapın.
        </Text>
      </div>
      <SeasonalPricesManager />
    </Stack>
  );
}

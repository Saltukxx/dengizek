import { Stack, Text, Title } from "@mantine/core";
import { CancellationRulesManager } from "@/components/dashboard/cancellation-rules-manager";

export default function DashboardCancellationRulesPage() {
  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>İptal kuralları</Title>
        <Text c="dimmed" size="sm">
          Fiyat planları ve tesis politikalarında kullanılacak iptal koşulları.
        </Text>
      </div>
      <CancellationRulesManager />
    </Stack>
  );
}

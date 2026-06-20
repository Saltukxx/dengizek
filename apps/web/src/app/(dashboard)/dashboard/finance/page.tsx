import { Stack, Text, Title } from "@mantine/core";
import { FinancePanel } from "@/components/dashboard/finance-panel";

export default function DashboardFinancePage() {
  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Finans</Title>
        <Text c="dimmed" size="sm">
          Ödeme kayıtları ve tahsilat özeti.
        </Text>
      </div>
      <FinancePanel />
    </Stack>
  );
}

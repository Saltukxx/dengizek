import { Stack, Text, Title } from "@mantine/core";
import { AnalyticsPanel } from "@/components/dashboard/analytics-panel";

export default function DashboardAnalyticsPage() {
  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Analitik</Title>
        <Text c="dimmed" size="sm">
          Tur ve talep etkinliklerinin son 30 günlük özeti.
        </Text>
      </div>
      <AnalyticsPanel />
    </Stack>
  );
}

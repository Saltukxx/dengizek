import { Stack, Text, Title } from "@mantine/core";
import { ConnectivityPanel } from "@/components/dashboard/connectivity-panel";

export default function DashboardConnectivityPage() {
  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Bağlantılar</Title>
        <Text c="dimmed" size="sm">
          iCal feed'leri ve kanal yöneticisi entegrasyonu.
        </Text>
      </div>
      <ConnectivityPanel />
    </Stack>
  );
}

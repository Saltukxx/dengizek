import { Stack, Text, Title } from "@mantine/core";
import { ExtrasManager } from "@/components/dashboard/extras-manager";

export default function DashboardExtrasPage() {
  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Ekstralar</Title>
        <Text c="dimmed" size="sm">
          Transfer, spa paketi gibi ücretli ek hizmetleri yönetin.
        </Text>
      </div>
      <ExtrasManager />
    </Stack>
  );
}

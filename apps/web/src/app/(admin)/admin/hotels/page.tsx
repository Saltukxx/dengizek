import { Stack, Text, Title } from "@mantine/core";
import { HotelsTable } from "@/components/admin/hotels-table";

export default function AdminHotelsPage() {
  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Oteller</Title>
        <Text c="dimmed" size="sm">
          Tesisleri yönetin, onaylayın veya reddedin.
        </Text>
      </div>
      <HotelsTable />
    </Stack>
  );
}

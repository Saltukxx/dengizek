import { Stack, Text, Title } from "@mantine/core";
import { AuditTable } from "@/components/admin/audit-table";

export default function AdminAuditPage() {
  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Denetim kaydı</Title>
        <Text c="dimmed" size="sm">
          Tüm yönetim işlemlerinin izlenebilir kaydı.
        </Text>
      </div>
      <AuditTable />
    </Stack>
  );
}

import { Stack, Text, Title } from "@mantine/core";
import { InquiriesTable } from "@/components/admin/inquiries-table";

export default function AdminInquiriesPage() {
  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Talepler</Title>
        <Text c="dimmed" size="sm">
          Tüm tesislerin misafir talepleri.
        </Text>
      </div>
      <InquiriesTable />
    </Stack>
  );
}

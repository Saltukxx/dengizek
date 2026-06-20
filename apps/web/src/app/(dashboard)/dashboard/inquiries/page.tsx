import { Stack, Text, Title } from "@mantine/core";
import { InquiriesInbox } from "@/components/dashboard/inquiries-inbox";

export default function DashboardInquiriesPage() {
  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Talepler</Title>
        <Text c="dimmed" size="sm">
          Misafir taleplerini görüntüleyin ve durumlarını güncelleyin.
        </Text>
      </div>
      <InquiriesInbox />
    </Stack>
  );
}

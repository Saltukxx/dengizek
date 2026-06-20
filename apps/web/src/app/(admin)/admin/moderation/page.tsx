import { Stack, Text, Title } from "@mantine/core";
import { ModerationQueue } from "@/components/admin/moderation-queue";

export default function AdminModerationPage() {
  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>İnceleme kuyruğu</Title>
        <Text c="dimmed" size="sm">
          İncelemeye gönderilen turları onaylayın veya not ile reddedin. Onay,
          taslaktan yayın anlık görüntüsü oluşturur.
        </Text>
      </div>
      <ModerationQueue />
    </Stack>
  );
}

import { Stack, Text, Title } from "@mantine/core";
import { MessageReviewQueue } from "@/components/admin/message-review-queue";

export default function AdminMessageReviewPage() {
  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Mesaj onayı</Title>
        <Text c="dimmed" size="sm">
          Misafir ile tesis arasındaki her mesaj (ilk talep dahil) önce burada
          onaylanır. Onaylanmayan mesaj karşı tarafa teslim edilmez; iletişim
          bilgileri ayrıca otomatik maskelenir.
        </Text>
      </div>
      <MessageReviewQueue />
    </Stack>
  );
}

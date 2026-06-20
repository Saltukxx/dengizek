import { Stack, Text, Title } from "@mantine/core";
import { ReviewsModerationQueue } from "@/components/admin/reviews-moderation-queue";

export default function AdminReviewsPage() {
  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Yorum moderasyonu</Title>
        <Text c="dimmed" size="sm">
          Misafir yorumlarını onaylayın veya reddedin.
        </Text>
      </div>
      <ReviewsModerationQueue />
    </Stack>
  );
}

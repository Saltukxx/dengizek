import { Stack, Text, Title } from "@mantine/core";
import { ReviewsManager } from "@/components/dashboard/reviews-manager";

export default function DashboardReviewsPage() {
  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Yorumlar</Title>
        <Text c="dimmed" size="sm">
          Misafir yorumlarını görüntüleyin ve yanıtlayın.
        </Text>
      </div>
      <ReviewsManager />
    </Stack>
  );
}

import { Stack, Text, Title } from "@mantine/core";
import { TourStepEditor } from "@/components/dashboard/tour-step-editor";

type PageProps = { params: Promise<{ tourId: string }> };

export default async function DashboardTourEditPage({ params }: PageProps) {
  const { tourId } = await params;
  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Tur düzenleyici — {tourId}</Title>
        <Text c="dimmed" size="sm">
          Adımları düzenleyin, sıralayın ve hazır olduğunuzda incelemeye gönderin.
        </Text>
      </div>
      <TourStepEditor tourId={tourId} />
    </Stack>
  );
}

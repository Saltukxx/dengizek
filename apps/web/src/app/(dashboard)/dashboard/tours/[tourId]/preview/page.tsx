import { Title } from "@mantine/core";
import { TourPreviewClient } from "@/components/dashboard/tour-preview-client";

type PageProps = { params: Promise<{ tourId: string }> };

export default async function TourPreviewPage({ params }: PageProps) {
  const { tourId } = await params;
  return (
    <>
      <Title order={2} mb="md" py="sm" visibleFrom="sm">
        Tur önizleme — {tourId}
      </Title>
      <TourPreviewClient tourId={tourId} />
    </>
  );
}

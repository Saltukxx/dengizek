import { Stack, Text, Title } from "@mantine/core";
import { MediaUploader } from "@/components/dashboard/media-uploader";

export default function DashboardMediaPage() {
  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Medya kütüphanesi</Title>
        <Text c="dimmed" size="sm" maw={560}>
          Video yükleyin ve durumu izleyin: yüklendi → işleniyor → hazır | hata → yayınlandı.
        </Text>
      </div>
      <MediaUploader />
    </Stack>
  );
}

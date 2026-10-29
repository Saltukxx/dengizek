import { Stack, Text, Title } from "@mantine/core";
import { AdTagsManager } from "@/components/admin/ad-tags-manager";

export default function AdminAdTagsPage() {
  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Reklam kodları</Title>
        <Text c="dimmed" size="sm">
          Google Ads ve GA4 kimliklerini sayfalara ya da otellere bağlayın. Dönüşüm, talep gönderildiğinde misafirin
          giriş yaptığı sayfanın ve talebin gittiği otelin kodlarıyla sayılır. Kodlar yalnız çerez onayı veren
          ziyaretçilerde çalışır.
        </Text>
      </div>
      <AdTagsManager />
    </Stack>
  );
}

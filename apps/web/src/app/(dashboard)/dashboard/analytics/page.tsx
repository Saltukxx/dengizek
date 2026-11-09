"use client";

import { Alert, Loader, Stack, Text, Title } from "@mantine/core";
import { IconLock } from "@tabler/icons-react";
import { AnalyticsPanel } from "@/components/dashboard/analytics-panel";
import { JourneyInsightsSection } from "@/components/dashboard/journey-insights-section";
import { useMyHotel } from "@/components/dashboard/use-my-hotel";

export default function DashboardAnalyticsPage() {
  const { hotel, loading } = useMyHotel();

  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Analitik</Title>
        <Text c="dimmed" size="sm">
          Tur ve talep etkinliklerinin son 30 günlük özeti.
        </Text>
      </div>
      {loading ? (
        <Loader />
      ) : !hotel?.analyticsEnabled ? (
        <Alert color="gray" icon={<IconLock size={16} />} title="Analitik henüz kapalı">
          Analitik erişimi, platform yöneticisi tarafından tesisiniz için
          açıldığında kullanılabilir olur. Erişim açıldığında ziyaretçi ve talep
          istatistikleriniz burada görünür.
        </Alert>
      ) : (
        <>
          <AnalyticsPanel />
          <JourneyInsightsSection />
        </>
      )}
    </Stack>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Loader, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { useMyHotel } from "./use-my-hotel";

interface AnalyticsData {
  total: number;
  byType: Record<string, number>;
  period: { from: string; to: string };
}

const eventLabels: Record<string, string> = {
  tour_view: "Tur görüntüleme",
  step_view: "Adım görüntüleme",
  inquiry_start: "Talep başlangıcı",
  inquiry_submit: "Talep gönderimi",
  ai_message: "AI mesajı",
};

export function AnalyticsPanel() {
  const { hotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const [data, setData] = useState<AnalyticsData | null>(null);

  const reload = useCallback(async () => {
    if (!hotel) return;
    const res = await fetch(`/api/manager/hotels/${hotel.id}/analytics`);
    const json = await res.json();
    if (json.ok) setData(json);
  }, [hotel]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (hotelLoading) return <Loader />;
  if (hotelError) {
    return (
      <Alert color="red" icon={<IconAlertCircle size={16} />}>
        {hotelError}
      </Alert>
    );
  }
  if (!data) return <Loader />;

  return (
    <Stack gap="md">
      <Text c="dimmed" size="sm">
        Son 30 gün ({new Date(data.period.from).toLocaleDateString("tr-TR")} —{" "}
        {new Date(data.period.to).toLocaleDateString("tr-TR")})
      </Text>
      <Paper withBorder p="lg" radius="md">
        <Title order={4}>{data.total.toLocaleString("tr-TR")}</Title>
        <Text c="dimmed" size="sm">
          Toplam olay
        </Text>
      </Paper>
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
        {Object.entries(data.byType).map(([type, count]) => (
          <Paper key={type} withBorder p="md" radius="md">
            <Text fw={600}>{eventLabels[type] ?? type}</Text>
            <Title order={3}>{count.toLocaleString("tr-TR")}</Title>
          </Paper>
        ))}
      </SimpleGrid>
      {Object.keys(data.byType).length === 0 && (
        <Text c="dimmed" size="sm">
          Henüz olay kaydı yok.
        </Text>
      )}
    </Stack>
  );
}

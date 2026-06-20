"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";

interface AdminAnalytics {
  totalEvents: number;
  inquiries: number;
  byType: Record<string, number>;
}

const eventLabels: Record<string, string> = {
  tour_view: "Tur görüntüleme",
  step_view: "Adım görüntüleme",
  inquiry_start: "Talep başlangıcı",
  inquiry_submit: "Talep gönderimi",
  ai_message: "AI mesajı",
};

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AdminAnalytics | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch("/api/admin/analytics");
    const json = await res.json();
    if (json.ok) setData(json);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!data) return <Loader />;

  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Platform analitiği</Title>
        <Text c="dimmed" size="sm">
          Son 30 gün — tüm oteller
        </Text>
      </div>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <Paper withBorder p="lg" radius="md">
          <Title order={4}>{data.totalEvents.toLocaleString("tr-TR")}</Title>
          <Text c="dimmed" size="sm">
            Toplam olay
          </Text>
        </Paper>
        <Paper withBorder p="lg" radius="md">
          <Title order={4}>{data.inquiries.toLocaleString("tr-TR")}</Title>
          <Text c="dimmed" size="sm">
            Yeni talepler
          </Text>
        </Paper>
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
        {Object.entries(data.byType).map(([type, count]) => (
          <Paper key={type} withBorder p="md" radius="md">
            <Text fw={600}>{eventLabels[type] ?? type}</Text>
            <Title order={3}>{count.toLocaleString("tr-TR")}</Title>
          </Paper>
        ))}
      </SimpleGrid>
    </Stack>
  );
}

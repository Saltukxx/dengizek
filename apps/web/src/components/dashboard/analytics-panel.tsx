"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Loader, Paper, Select, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { useMyHotel } from "./use-my-hotel";

interface AnalyticsData {
  totalEvents: number;
  total: number;
  byType: Record<string, number>;
  inquiries: number;
  timeSeries: { day: string; count: number }[];
  conversionRate: number | null;
  period: { from: string; to: string; days: number };
}

const eventLabels: Record<string, string> = {
  tour_view: "Tur görüntüleme",
  step_view: "Adım görüntüleme",
  inquiry_start: "Talep başlangıcı",
  inquiry_submit: "Talep gönderimi",
  ai_message: "AI mesajı",
};

function GroupBar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = Math.round((count / max) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Text size="xs" w={90} c="dimmed">
        {new Date(label).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
      </Text>
      <div style={{ flex: 1, height: 8, background: "var(--mantine-color-gray-2)", borderRadius: 4 }}>
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "var(--mantine-color-indigo-6)",
            borderRadius: 4,
          }}
        />
      </div>
      <Text size="xs" w={32}>
        {count}
      </Text>
    </div>
  );
}

export function AnalyticsPanel() {
  const { hotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [period, setPeriod] = useState("30");

  const reload = useCallback(async () => {
    if (!hotel) return;
    const res = await fetch(`/api/manager/hotels/${hotel.id}/analytics?period=${period}`);
    const json = await res.json();
    if (json.ok) setData(json);
  }, [hotel, period]);

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

  const maxDay = Math.max(...data.timeSeries.map((d) => d.count), 1);

  return (
    <Stack gap="md">
      <Select
        label="Dönem"
        w={200}
        data={[
          { value: "7", label: "7 gün" },
          { value: "30", label: "30 gün" },
          { value: "90", label: "90 gün" },
        ]}
        value={period}
        onChange={(v) => v && setPeriod(v)}
      />
      <Text c="dimmed" size="sm">
        Son {data.period.days} gün ({new Date(data.period.from).toLocaleDateString("tr-TR")} —{" "}
        {new Date(data.period.to).toLocaleDateString("tr-TR")})
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
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
        <Paper withBorder p="lg" radius="md">
          <Title order={4}>
            {data.conversionRate != null ? `%${data.conversionRate}` : "—"}
          </Title>
          <Text c="dimmed" size="sm">
            Tur → talep dönüşümü
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
      {Object.keys(data.byType).length === 0 && (
        <Text c="dimmed" size="sm">
          Henüz olay kaydı yok.
        </Text>
      )}
      {data.timeSeries.length > 0 && (
        <Paper withBorder radius="md" p="md">
          <Text fw={600} mb="sm">
            Günlük olaylar
          </Text>
          <Stack gap={4}>
            {data.timeSeries.map((d) => (
              <GroupBar key={d.day} label={d.day} count={d.count} max={maxDay} />
            ))}
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}

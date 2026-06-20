"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader, Paper, Select, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";

interface AdminAnalytics {
  totalEvents: number;
  inquiries: number;
  byType: Record<string, number>;
  byHotel: { hotelId: string | null; hotelName: string; count: number }[];
  timeSeries: { day: string; count: number }[];
  conversionRate: number | null;
  period: { from: string; to: string; days: number };
  hotels: { id: string; name: string }[];
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
  const [hotelId, setHotelId] = useState<string | null>(null);
  const [period, setPeriod] = useState("30");

  const reload = useCallback(async () => {
    const params = new URLSearchParams({ period });
    if (hotelId) params.set("hotelId", hotelId);
    const res = await fetch(`/api/admin/analytics?${params}`);
    const json = await res.json();
    if (json.ok) setData(json);
  }, [hotelId, period]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!data) return <Loader />;

  const maxDay = Math.max(...data.timeSeries.map((d) => d.count), 1);

  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Platform analitiği</Title>
        <Text c="dimmed" size="sm">
          Son {data.period.days} gün
        </Text>
      </div>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <Select
          label="Dönem"
          data={[
            { value: "7", label: "7 gün" },
            { value: "30", label: "30 gün" },
            { value: "90", label: "90 gün" },
          ]}
          value={period}
          onChange={(v) => v && setPeriod(v)}
        />
        <Select
          label="Tesis"
          clearable
          searchable
          data={data.hotels.map((h) => ({ value: h.id, label: h.name }))}
          value={hotelId}
          onChange={setHotelId}
        />
      </SimpleGrid>
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
      {data.byHotel.length > 0 && (
        <Paper withBorder radius="md" p="md">
          <Text fw={600} mb="sm">
            En aktif tesisler
          </Text>
          <Table>
            <Table.Tbody>
              {data.byHotel.map((h) => (
                <Table.Tr key={h.hotelId ?? h.hotelName}>
                  <Table.Td>{h.hotelName}</Table.Td>
                  <Table.Td>{h.count}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
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
            background: "var(--mantine-color-blue-6)",
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

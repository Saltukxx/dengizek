"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  IconActivity,
  IconArrowsExchange,
  IconMessage2,
  type TablerIcon,
} from "@tabler/icons-react";
import { ALL_EVENT_LABELS } from "@/lib/schemas/analytics";
import { SearchInsightsPanel } from "@/components/admin/search-insights";
import { QuestionInsightsPanel } from "@/components/admin/question-insights";
import { CriticalGapsPanel } from "@/components/admin/critical-gaps";
import { RankedBars, TrendChart } from "@/components/admin/analytics-charts";

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

const eventLabels = ALL_EVENT_LABELS;

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

  if (!data) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }

  const days = data.period.days || 1;
  const perDay = Math.round(data.totalEvents / days);

  const typeItems = Object.entries(data.byType)
    .map(([type, count]) => ({ label: eventLabels[type] ?? type, value: count }))
    .sort((a, b) => b.value - a.value);

  const hotelItems = data.byHotel.map((h) => ({ label: h.hotelName, value: h.count }));

  return (
    <Stack gap="lg" py="sm">
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="md">
        <div>
          <Title order={2}>Platform analitiği</Title>
          <Text c="dimmed" size="sm">
            Son {data.period.days} günün ziyaretçi ve talep hareketi
          </Text>
        </div>
        <Group gap="sm" wrap="nowrap">
          <Select
            aria-label="Dönem"
            w={110}
            data={[
              { value: "7", label: "7 gün" },
              { value: "30", label: "30 gün" },
              { value: "90", label: "90 gün" },
            ]}
            value={period}
            onChange={(v) => v && setPeriod(v)}
            allowDeselect={false}
          />
          <Select
            aria-label="Tesis"
            placeholder="Tüm tesisler"
            w={200}
            clearable
            searchable
            data={data.hotels.map((h) => ({ value: h.id, label: h.name }))}
            value={hotelId}
            onChange={setHotelId}
          />
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <StatTile
          icon={IconActivity}
          label="Toplam olay"
          value={data.totalEvents.toLocaleString("tr-TR")}
          context={`Günlük ortalama ${perDay.toLocaleString("tr-TR")}`}
        />
        <StatTile
          icon={IconMessage2}
          label="Yeni talep"
          value={data.inquiries.toLocaleString("tr-TR")}
          context={data.totalEvents > 0 ? `${days} günlük dönem` : "Henüz talep yok"}
        />
        <StatTile
          icon={IconArrowsExchange}
          label="Tur → talep dönüşümü"
          value={data.conversionRate != null ? `%${data.conversionRate}` : "—"}
          context="Tur görüntüleyen ziyaretçinin talep oranı"
        />
      </SimpleGrid>

      <Paper withBorder radius="md" p="lg">
        <Text fw={600} mb="md">
          Günlük olaylar
        </Text>
        <TrendChart data={data.timeSeries} />
      </Paper>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Paper withBorder radius="md" p="lg">
          <Text fw={600} mb="md">
            Olay türleri
          </Text>
          <RankedBars items={typeItems} emptyLabel="Bu dönemde olay yok." />
        </Paper>
        <Paper withBorder radius="md" p="lg">
          <Text fw={600} mb="md">
            En aktif tesisler
          </Text>
          <RankedBars items={hotelItems} emptyLabel="Tesis hareketi yok." />
        </Paper>
      </SimpleGrid>

      <QuestionInsightsPanel period={period} hotelId={hotelId} />
      <SearchInsightsPanel />
      <CriticalGapsPanel />
    </Stack>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  context,
}: {
  icon: TablerIcon;
  label: string;
  value: string;
  context: string;
}) {
  return (
    <Paper withBorder radius="md" p="lg">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Text size="xs" c="dimmed" tt="uppercase" fw={700} lts="0.05em">
          {label}
        </Text>
        <Icon size={18} stroke={1.6} color="var(--mantine-color-gray-5)" />
      </Group>
      <Text fw={700} lh={1.1} mt="xs" style={{ fontSize: 30, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </Text>
      <Text size="xs" c="dimmed" mt={6}>
        {context}
      </Text>
    </Paper>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Paper, Select, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { ANALYTICS_EVENT_LABELS } from "@/lib/schemas/analytics";
import { panelApi } from "@/lib/panel-api";
import { PanelError, PanelLoading } from "@/components/panel-resource-state";
import { useMyHotel } from "./use-my-hotel";

interface AnalyticsData {
  totalEvents: number;
  total: number;
  byType: Record<string, number>;
  funnel?: {
    hotelViews: number;
    tourStarts: number;
    inquiryStarts: number;
    inquirySubmits: number;
  };
  inquiries: number;
  timeSeries: { day: string; count: number }[];
  conversionRate: number | null;
  period: { from: string; to: string; days: number };
}

/** Etiketler misafir yüzeyiyle ortak kaynaktan gelir (schemas/analytics.ts). */
const eventLabels: Record<string, string> = ANALYTICS_EVENT_LABELS;

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
  const { hotel, loading: hotelLoading, error: hotelError, reload: reloadHotels } = useMyHotel();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState("30");

  const reload = useCallback(async () => {
    if (!hotel) return;
    setError(null);
    try {
      setData(await panelApi<AnalyticsData>(`/api/manager/hotels/${hotel.id}/analytics?period=${period}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analitik verileri yüklenemedi.");
    }
  }, [hotel, period]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (hotelLoading) return <PanelLoading />;
  if (hotelError) return <PanelError message={hotelError} onRetry={() => void reloadHotels()} />;
  if (error) return <PanelError message={error} onRetry={() => void reload()} />;
  if (!data) return <PanelLoading label="Analitik verileri yükleniyor…" />;

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
            Görüntüleme → talep dönüşümü
          </Text>
        </Paper>
      </SimpleGrid>

      {data.funnel && (
        <Paper withBorder radius="md" p="md">
          <Text fw={600} mb="sm">
            Ziyaretçi hunisi
          </Text>
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
            {[
              ["Otel sayfası", data.funnel.hotelViews],
              ["Tur başlatma", data.funnel.tourStarts],
              ["Talep başlangıcı", data.funnel.inquiryStarts],
              ["Talep gönderimi", data.funnel.inquirySubmits],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <Title order={4}>{Number(value).toLocaleString("tr-TR")}</Title>
                <Text c="dimmed" size="sm">
                  {label}
                </Text>
              </div>
            ))}
          </SimpleGrid>
        </Paper>
      )}
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

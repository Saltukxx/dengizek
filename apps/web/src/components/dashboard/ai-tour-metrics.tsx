"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { useMyHotel } from "./use-my-hotel";

interface AiMetricsData {
  tourStarts: number;
  tourCompletes: number;
  completionRate: number | null;
  avgProgressRatio: number | null;
  autoTour: {
    starts: number;
    completes: number;
    completionRate: number | null;
  };
  toolUsage: { price: number; fact: number };
  guardTriggered: number;
  readinessScore: number;
  readinessIssues: string[];
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Paper withBorder p="md" radius="md">
      <Text size="xs" c="dimmed" tt="uppercase">
        {label}
      </Text>
      <Title order={3} mt={4}>
        {value}
      </Title>
      {hint ? (
        <Text size="xs" c="dimmed" mt={4}>
          {hint}
        </Text>
      ) : null}
    </Paper>
  );
}

export function AiTourMetrics() {
  const { hotel, loading: hotelLoading, error: hotelError } = useMyHotel();
  const [data, setData] = useState<AiMetricsData | null>(null);

  const reload = useCallback(async () => {
    if (!hotel) return;
    const res = await fetch(`/api/manager/hotels/${hotel.id}/ai-metrics`);
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

  const progressPct =
    data.avgProgressRatio != null ? `${Math.round(data.avgProgressRatio * 100)}%` : "—";

  return (
    <Stack gap="md">
      <div>
        <Title order={4}>AI Tur Motoru</Title>
        <Text size="sm" c="dimmed">
          Son 30 gün — tur tamamlama ve doğrulanmış fiyat/fact kullanımı. Ort. ilerleme: tur
          başına ulaşılan en yüksek adım oranı.
        </Text>
      </div>

      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
        <MetricCard
          label="Tur başlangıcı"
          value={String(data.tourStarts)}
        />
        <MetricCard
          label="Tur tamamlama"
          value={
            data.completionRate != null ? `%${data.completionRate}` : "—"
          }
          hint={`${data.tourCompletes} tamamlanan`}
        />
        <MetricCard label="Ort. ilerleme" value={progressPct} />
        <MetricCard
          label="Hazırlık skoru"
          value={`${data.readinessScore}/100`}
        />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <MetricCard
          label="Fiyat aracı"
          value={String(data.toolUsage.price)}
        />
        <MetricCard
          label="Fact aracı"
          value={String(data.toolUsage.fact)}
        />
        <MetricCard
          label="Guard tetik"
          value={String(data.guardTriggered)}
          hint="Serbest metin fiyat engeli"
        />
      </SimpleGrid>

      {data.autoTour.starts > 0 ? (
        <Paper withBorder p="md" radius="md">
          <Text size="sm" fw={500}>
            Otomatik tur
          </Text>
          <Text size="sm" c="dimmed" mt={4}>
            {data.autoTour.starts} başlangıç · {data.autoTour.completes} tamamlama
            {data.autoTour.completionRate != null
              ? ` · %${data.autoTour.completionRate} oran`
              : ""}
          </Text>
        </Paper>
      ) : null}

      {data.readinessIssues.length > 0 ? (
        <Paper withBorder p="md" radius="md">
          <Text size="sm" fw={500} mb="xs">
            Veri kalitesi uyarıları
          </Text>
          <Stack gap={6}>
            {data.readinessIssues.map((issue) => (
              <Badge key={issue} variant="light" color="orange" fullWidth>
                {issue}
              </Badge>
            ))}
          </Stack>
        </Paper>
      ) : null}
    </Stack>
  );
}

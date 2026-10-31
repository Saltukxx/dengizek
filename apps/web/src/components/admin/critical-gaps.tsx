"use client";

import { useEffect, useState } from "react";
import { Badge, Group, Loader, Paper, Stack, Text } from "@mantine/core";
import type { CriticalGap } from "@/lib/ai/readiness-score";

interface Data {
  totalHotels: number;
  withGaps: number;
  byField: Record<string, number>;
  hotels: Array<{ slug: string; name: string; status: string; gaps: CriticalGap[] }>;
}

const FIELD_LABELS: Record<CriticalGap["field"], string> = {
  "giris-cikis": "Giriş/çıkış saati",
  "evcil-hayvan": "Evcil hayvan",
  "yeme-icme": "Yeme-içme",
  "oda-kapasite": "Oda kapasitesi",
};

/** Otel başına kritik bilgi eksikleri — rehberin "bilgim yok" diyeceği konular. */
export function CriticalGapsPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/admin/critical-gaps")
      .then((res) => res.json())
      .then((json) => (json.ok ? setData(json) : setFailed(true)))
      .catch(() => setFailed(true));
  }, []);

  if (failed) return null;
  if (!data) return <Loader size="sm" />;

  return (
    <Paper withBorder radius="md" p="md">
      <Text fw={600}>
        Kritik bilgi eksikleri ({data.withGaps}/{data.totalHotels} otel)
      </Text>
      <Text size="xs" c="dimmed" mb="sm">
        Misafirlerin en çok sorduğu ve rehberin yalnız otelin verisinden cevaplayabildiği bilgiler (taslak veri).
        {Object.keys(data.byField).length
          ? ` ${Object.entries(data.byField)
              .map(([f, n]) => `${FIELD_LABELS[f as CriticalGap["field"]] ?? f}: ${n}`)
              .join(" · ")}`
          : ""}
      </Text>
      {data.hotels.length ? (
        <Stack gap={8}>
          {data.hotels.map((h) => (
            <Group key={h.slug} justify="space-between" wrap="nowrap" gap="sm" align="flex-start">
              <Text size="sm" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                {h.name}
              </Text>
              <Group gap={4} justify="flex-end" style={{ flexShrink: 1 }}>
                {h.gaps.map((g) => (
                  <Badge key={g.field} variant="light" color="orange" title={g.message}>
                    {FIELD_LABELS[g.field]}
                  </Badge>
                ))}
              </Group>
            </Group>
          ))}
        </Stack>
      ) : (
        <Text size="sm" c="dimmed">
          Eksik yok.
        </Text>
      )}
    </Paper>
  );
}

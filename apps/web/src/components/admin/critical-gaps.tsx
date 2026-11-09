"use client";

import { useEffect, useState } from "react";
import { Badge, Group, Loader, Stack, Text } from "@mantine/core";
import type { CriticalGap } from "@/lib/ai/readiness-score";
import { PanelCard, RankedBars, StatChips, SubHead } from "@/components/admin/analytics-charts";

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

  const fieldItems = Object.entries(data.byField)
    .map(([f, n]) => ({ label: FIELD_LABELS[f as CriticalGap["field"]] ?? f, value: n }))
    .sort((a, b) => b.value - a.value);

  const complete = data.totalHotels - data.withGaps;

  return (
    <PanelCard
      title="Kritik bilgi eksikleri"
      subtitle="Misafirlerin en çok sorduğu ve rehberin yalnız otelin verisinden cevaplayabildiği bilgiler."
    >
      <StatChips
        items={[
          { label: "Eksiği olan tesis", value: `${data.withGaps}/${data.totalHotels}`, accent: data.withGaps > 0 },
          { label: "Tam dolu tesis", value: complete.toLocaleString("tr-TR") },
        ]}
      />

      {fieldItems.length > 0 && (
        <div style={{ marginTop: "var(--mantine-spacing-lg)", maxWidth: 420 }}>
          <SubHead>En sık eksik alanlar</SubHead>
          <RankedBars items={fieldItems} />
        </div>
      )}

      <div style={{ marginTop: "var(--mantine-spacing-lg)" }}>
        <SubHead>Tesis bazında eksikler</SubHead>
        {data.hotels.length ? (
          <Stack gap={0}>
            {data.hotels.map((h, i) => (
              <Group
                key={h.slug}
                justify="space-between"
                wrap="nowrap"
                gap="sm"
                align="center"
                py={8}
                style={{ borderTop: i === 0 ? undefined : "1px solid var(--mantine-color-gray-1)" }}
              >
                <Text size="sm" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                  {h.name}
                </Text>
                <Group gap={4} justify="flex-end" wrap="wrap" style={{ flexShrink: 1 }}>
                  {h.gaps.map((g) => (
                    <Badge key={g.field} variant="light" color="orange" radius="sm" title={g.message}>
                      {FIELD_LABELS[g.field]}
                    </Badge>
                  ))}
                </Group>
              </Group>
            ))}
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">
            Tüm tesislerde kritik bilgiler tam.
          </Text>
        )}
      </div>
    </PanelCard>
  );
}

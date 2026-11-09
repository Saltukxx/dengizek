"use client";

import { useCallback, useEffect, useState } from "react";
import { Select, Stack, Text, Title } from "@mantine/core";
import { panelApi } from "@/lib/panel-api";
import { PanelError, PanelLoading } from "@/components/panel-resource-state";
import { JourneyInsightsView, type JourneyInsightsData } from "@/components/analytics/journey-insights-view";
import { useMyHotel } from "./use-my-hotel";

/** Otel paneli — kendi tesisinin tur çıkışları, rehber özeti ve soru → talep. */
export function JourneyInsightsSection() {
  const { hotel } = useMyHotel();
  const [period, setPeriod] = useState("30");
  const [data, setData] = useState<JourneyInsightsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!hotel) return;
    setError(null);
    setData(null);
    try {
      setData(await panelApi<JourneyInsightsData>(`/api/manager/hotels/${hotel.id}/journey-insights?period=${period}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yolculuk analizi yüklenemedi.");
    }
  }, [hotel, period]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Stack gap="md" mt="xl">
      <div>
        <Title order={2}>Misafir yolculuğu ve rehber</Title>
        <Text c="dimmed" size="sm">
          Misafirlerin turda nereye kadar izlediği, rehbere ne sorduğu ve hangi sorulardan sonra talep gönderdiği.
        </Text>
      </div>
      <Select
        label="Dönem"
        data={[
          { value: "7", label: "Son 7 gün" },
          { value: "30", label: "Son 30 gün" },
          { value: "90", label: "Son 90 gün" },
        ]}
        value={period}
        onChange={(v) => setPeriod(v ?? "30")}
        allowDeselect={false}
        maw={240}
      />
      {error ? (
        <PanelError message={error} onRetry={() => void load()} />
      ) : !data ? (
        <PanelLoading label="Yolculuk analizi yükleniyor…" />
      ) : (
        <JourneyInsightsView data={data} />
      )}
    </Stack>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Loader, Select, SimpleGrid, Stack, Tabs, Text, Title } from "@mantine/core";
import { JourneyInsightsView, type JourneyInsightsData } from "@/components/analytics/journey-insights-view";
import { AiConversationLog } from "@/components/admin/ai-conversation-log";

/**
 * Yolculuk ve rehber analizi — tur çıkışları, soru → talep, rehber konuşma
 * kayıtları ve tek ziyaretin zaman çizelgesi.
 */
export default function AdminJourneyPage() {
  const [period, setPeriod] = useState("30");
  const [hotelId, setHotelId] = useState<string | null>(null);
  const [hotels, setHotels] = useState<Array<{ value: string; label: string }>>([]);
  const [data, setData] = useState<JourneyInsightsData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Otel listesi analitik özetinden gelir (zaten admin'e açık uç).
    fetch(`/api/admin/analytics?period=30`)
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) setHotels(json.hotels.map((h: { id: string; name: string }) => ({ value: h.id, label: h.name })));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ period });
    if (hotelId) params.set("hotelId", hotelId);
    setData(null);
    setFailed(false);
    fetch(`/api/admin/journey-insights?${params}`)
      .then((r) => r.json())
      .then((json) => (json.ok ? setData(json) : setFailed(true)))
      .catch(() => setFailed(true));
  }, [period, hotelId]);

  return (
    <Stack gap="md" py="sm">
      <div>
        <Title order={2}>Yolculuk ve rehber analizi</Title>
        <Text c="dimmed" size="sm">
          Ziyaretçilerin turda nereye kadar izlediği, rehbere ne sorduğu ve hangi sorulardan sonra talep gönderdiği.
          Sorular ve cevaplar 90 gün saklanır.
        </Text>
      </div>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" maw={640}>
        <Select
          label="Otel"
          placeholder="Tüm oteller"
          clearable
          searchable
          data={hotels}
          value={hotelId}
          onChange={setHotelId}
        />
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
        />
      </SimpleGrid>

      <Tabs defaultValue="ozet" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="ozet">Özet</Tabs.Tab>
          <Tabs.Tab value="kayitlar">Konuşma kayıtları</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="ozet" pt="md">
          {failed ? (
            <Text c="red" size="sm">
              Analiz yüklenemedi.
            </Text>
          ) : !data ? (
            <Loader size="sm" />
          ) : (
            <JourneyInsightsView data={data} showHotel={!hotelId} />
          )}
        </Tabs.Panel>

        <Tabs.Panel value="kayitlar" pt="md">
          <AiConversationLog key={`${period}-${hotelId ?? "tum"}`} period={period} hotelId={hotelId} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

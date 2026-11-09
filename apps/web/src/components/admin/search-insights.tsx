"use client";

import { useEffect, useState } from "react";
import { Badge, Group, Loader, SimpleGrid, Text } from "@mantine/core";
import type { SearchInsights } from "@/lib/ai/search-log";
import { PanelCard, RankedList, StatChips, SubHead } from "@/components/admin/analytics-charts";

type Data =
  | (Omit<SearchInsights, "topHotels"> & {
      periodDays: number;
      topHotels: Array<SearchInsights["topHotels"][number] & { hotelName: string }>;
    })
  | null;

/** Arama asistanı kayıtları — sözlüğe eklenecek kelimeler ve sonuçsuz aramalar. */
export function SearchInsightsPanel() {
  const [data, setData] = useState<Data>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/admin/search-insights")
      .then((res) => res.json())
      .then((json) => (json.ok ? setData(json) : setFailed(true)))
      .catch(() => setFailed(true));
  }, []);

  if (failed) return null;
  if (!data) return <Loader size="sm" />;

  return (
    <PanelCard
      title={`Arama asistanı · son ${data.periodDays} gün`}
      subtitle="Sonuçsuz aramalar ve anlaşılmayan kelimeler, asistanın sözlüğüne eklenecek adaylardır."
    >
      <StatChips
        items={[
          { label: "Toplam arama", value: data.total.toLocaleString("tr-TR") },
          { label: "Sonuçsuz arama", value: data.noResults.length.toLocaleString("tr-TR"), accent: data.noResults.length > 0 },
        ]}
      />

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl" mt="lg">
        <div>
          <SubHead>Sonuç bulunamayan aramalar</SubHead>
          <RankedList
            tone="orange"
            empty="Hepsi sonuç verdi."
            items={data.noResults.map((q) => ({ key: q.query, primary: q.query, value: `${q.count}×` }))}
          />
        </div>
        <div>
          <SubHead>En çok arananlar</SubHead>
          <RankedList
            empty="Henüz arama yok."
            items={data.top.map((q) => ({ key: q.query, primary: q.query, value: `${q.count}×` }))}
          />
        </div>
        <div>
          <SubHead>Anlaşılmayan kelimeler</SubHead>
          {data.unknownWords.length ? (
            <Group gap={6}>
              {data.unknownWords.map((w) => (
                <Badge key={w.word} variant="light" color="orange" radius="sm">
                  {w.word} · {w.count}
                </Badge>
              ))}
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              Yok.
            </Text>
          )}
        </div>
        <div>
          <SubHead>En çok gösterilen oteller</SubHead>
          <RankedList
            numbered={false}
            empty="Henüz yok."
            items={(data.topHotels ?? []).map((h) => ({
              key: h.hotelSlug,
              primary: h.hotelName,
              secondary: `ilk sırada ${h.first}×`,
              value: `${h.count}×`,
            }))}
          />
        </div>
      </SimpleGrid>
    </PanelCard>
  );
}

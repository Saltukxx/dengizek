"use client";

import { useEffect, useState } from "react";
import { Badge, Group, Loader, Paper, SimpleGrid, Stack, Text } from "@mantine/core";
import type { SearchInsights } from "@/lib/ai/search-log";

/** Arama asistanı kayıtları — sözlüğe eklenecek kelimeler ve sonuçsuz aramalar. */
export function SearchInsightsPanel() {
  const [data, setData] = useState<(SearchInsights & { periodDays: number }) | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/admin/search-insights")
      .then((res) => res.json())
      .then((json) => (json.ok ? setData(json) : setFailed(true)))
      .catch(() => setFailed(true));
  }, []);

  if (failed) return null;
  if (!data) return <Loader size="sm" />;

  const list = (items: Array<{ query: string; count: number }>, empty: string) =>
    items.length ? (
      <Stack gap={6}>
        {items.map((item) => (
          <Group key={item.query} justify="space-between" wrap="nowrap" gap="sm">
            <Text size="sm" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
              {item.query}
            </Text>
            <Badge variant="outline">{item.count}×</Badge>
          </Group>
        ))}
      </Stack>
    ) : (
      <Text size="sm" c="dimmed">
        {empty}
      </Text>
    );

  return (
    <Paper withBorder radius="md" p="md">
      <Text fw={600}>Arama asistanı (son {data.periodDays} gün · {data.total.toLocaleString("tr-TR")} arama)</Text>
      <Text size="xs" c="dimmed" mb="sm">
        Sonuçsuz aramalar ve anlaşılmayan kelimeler, asistanın sözlüğüne eklenecek adaylardır.
      </Text>
      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
        <div>
          <Text size="sm" fw={500} mb={6}>
            Sonuç bulunamayan aramalar
          </Text>
          {list(data.noResults, "Yok")}
        </div>
        <div>
          <Text size="sm" fw={500} mb={6}>
            Anlaşılmayan kelimeler
          </Text>
          {data.unknownWords.length ? (
            <Group gap={6}>
              {data.unknownWords.map((w) => (
                <Badge key={w.word} variant="light" color="orange">
                  {w.word} · {w.count}
                </Badge>
              ))}
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              Yok
            </Text>
          )}
        </div>
        <div>
          <Text size="sm" fw={500} mb={6}>
            En çok arananlar
          </Text>
          {list(data.top, "Henüz arama yok")}
        </div>
      </SimpleGrid>
    </Paper>
  );
}

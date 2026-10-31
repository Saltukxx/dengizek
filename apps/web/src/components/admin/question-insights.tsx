"use client";

import { useEffect, useState } from "react";
import { Badge, Group, Loader, Paper, Progress, SimpleGrid, Stack, Text } from "@mantine/core";
import { QUESTION_TOPIC_LABELS, type QuestionGroup, type QuestionInsights } from "@/lib/ai/question-log";

type Data = Omit<QuestionInsights, "byHotel"> & {
  periodDays: number;
  byHotel: Array<QuestionInsights["byHotel"][number] & { hotelName: string }>;
};

const pct = (n: number, total: number) => (total ? `%${Math.round((n / total) * 100)}` : "—");

/** Rehbere sorulan sorular — en çok sorulanlar, otel ve konu dağılımı. */
export function QuestionInsightsPanel({ period, hotelId }: { period: string; hotelId: string | null }) {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams({ period });
    if (hotelId) params.set("hotelId", hotelId);
    setData(null);
    fetch(`/api/admin/question-insights?${params}`)
      .then((res) => res.json())
      .then((json) => (json.ok ? setData(json) : setFailed(true)))
      .catch(() => setFailed(true));
  }, [period, hotelId]);

  if (failed) return null;
  if (!data) return <Loader size="sm" />;

  const questions = (items: QuestionGroup[], empty: string, showMissed = false) =>
    items.length ? (
      <Stack gap={6}>
        {items.map((item) => (
          <Group key={item.question} justify="space-between" wrap="nowrap" gap="sm">
            <div style={{ minWidth: 0 }}>
              <Text size="sm" style={{ overflowWrap: "anywhere" }}>
                {item.question}
              </Text>
              <Text size="xs" c="dimmed">
                {QUESTION_TOPIC_LABELS[item.topic]}
                {item.hotels > 1 ? ` · ${item.hotels} otel` : ""}
              </Text>
            </div>
            <Badge variant="outline" color={showMissed ? "orange" : undefined} style={{ flexShrink: 0 }}>
              {showMissed ? item.unanswered : item.count}×
            </Badge>
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
      <Text fw={600}>
        Rehbere sorulan sorular (son {data.periodDays} gün · {data.total.toLocaleString("tr-TR")} soru)
      </Text>
      <Text size="xs" c="dimmed" mb="sm">
        Cevaplanma oranı: {data.answerRate == null ? "—" : `%${Math.round(data.answerRate * 100)}`}
        {data.byOutcome.length ? ` · ${data.byOutcome.map((o) => `${o.label} ${o.count}`).join(" · ")}` : ""}
        {data.byLanguage.length ? ` · Dil: ${data.byLanguage.map((l) => `${l.language} ${l.count}`).join(", ")}` : ""}
      </Text>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <div>
          <Text size="sm" fw={500} mb={6}>
            En çok sorulanlar
          </Text>
          {questions(data.topQuestions, "Henüz soru yok")}
        </div>
        <div>
          <Text size="sm" fw={500} mb={6}>
            En çok cevapsız kalanlar
          </Text>
          {questions(data.topUnanswered, "Yok", true)}
        </div>
        <div>
          <Text size="sm" fw={500} mb={6}>
            Konular
          </Text>
          <Stack gap={8}>
            {data.byTopic.map((t) => (
              <div key={t.topic}>
                <Group justify="space-between" gap="xs">
                  <Text size="sm">{t.label}</Text>
                  <Text size="xs" c="dimmed">
                    {t.count} · cevapsız {pct(t.unanswered, t.count)}
                  </Text>
                </Group>
                <Progress value={(t.count / data.total) * 100} size="sm" />
              </div>
            ))}
            {!data.byTopic.length && (
              <Text size="sm" c="dimmed">
                Yok
              </Text>
            )}
          </Stack>
        </div>
        {!hotelId && (
          <div>
            <Text size="sm" fw={500} mb={6}>
              En çok soru alan oteller
            </Text>
            {data.byHotel.length ? (
              <Stack gap={6}>
                {data.byHotel.map((h) => (
                  <Group key={h.hotelSlug} justify="space-between" wrap="nowrap" gap="sm">
                    <Text size="sm" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                      {h.hotelName}
                    </Text>
                    <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                      {h.count} soru · cevapsız {pct(h.unanswered, h.count)}
                    </Text>
                  </Group>
                ))}
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">
                Yok
              </Text>
            )}
          </div>
        )}
      </SimpleGrid>
    </Paper>
  );
}

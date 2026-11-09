"use client";

import { useEffect, useState } from "react";
import { Loader, SimpleGrid } from "@mantine/core";
import { QUESTION_TOPIC_LABELS, type QuestionInsights } from "@/lib/ai/question-log";
import type { FeedbackSummary } from "@/lib/ai/feedback";
import { PanelCard, RankedBars, RankedList, StatChips, SubHead } from "@/components/admin/analytics-charts";

type Data = Omit<QuestionInsights, "byHotel"> & {
  periodDays: number;
  feedback?: FeedbackSummary;
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

  const chips: { label: string; value: string; accent?: boolean }[] = [
    { label: "Toplam soru", value: data.total.toLocaleString("tr-TR") },
    { label: "Cevaplanma oranı", value: data.answerRate == null ? "—" : `%${Math.round(data.answerRate * 100)}`, accent: true },
  ];
  if (data.feedback && data.feedback.up + data.feedback.down > 0) {
    chips.push({
      label: `Faydalı oy (${data.feedback.up}/${data.feedback.up + data.feedback.down})`,
      value: `%${Math.round((data.feedback.positiveRate ?? 0) * 100)}`,
    });
  }

  return (
    <PanelCard title={`Rehbere sorulan sorular · son ${data.periodDays} gün`}>
      <StatChips items={chips} />

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl" mt="lg">
        <div>
          <SubHead>En çok sorulanlar</SubHead>
          <RankedList
            empty="Henüz soru yok."
            items={data.topQuestions.map((q) => ({
              key: q.question,
              primary: q.question,
              secondary: `${QUESTION_TOPIC_LABELS[q.topic]}${q.hotels > 1 ? ` · ${q.hotels} otel` : ""}`,
              value: `${q.count}×`,
            }))}
          />
        </div>
        <div>
          <SubHead>En çok cevapsız kalanlar</SubHead>
          <RankedList
            tone="orange"
            empty="Cevapsız soru yok."
            items={data.topUnanswered.map((q) => ({
              key: q.question,
              primary: q.question,
              secondary: QUESTION_TOPIC_LABELS[q.topic],
              value: `${q.unanswered}×`,
            }))}
          />
        </div>
        <div>
          <SubHead>Konular</SubHead>
          <RankedBars
            emptyLabel="Konu verisi yok."
            items={data.byTopic.map((t) => ({ label: t.label, value: t.count }))}
          />
        </div>
        {data.feedback?.topDown.length ? (
          <div>
            <SubHead>Faydalı bulunmayan cevaplar</SubHead>
            <RankedList
              numbered={false}
              tone="red"
              items={data.feedback.topDown.map((d) => ({
                key: d.question,
                primary: d.question,
                secondary: `Rehber: ${d.answer}`,
                value: `${d.count}×`,
              }))}
            />
          </div>
        ) : null}
        {!hotelId && (
          <div>
            <SubHead>En çok soru alan oteller</SubHead>
            <RankedList
              numbered={false}
              empty="Veri yok."
              items={data.byHotel.map((h) => ({
                key: h.hotelSlug,
                primary: h.hotelName,
                secondary: `cevapsız ${pct(h.unanswered, h.count)}`,
                value: h.count,
              }))}
            />
          </div>
        )}
      </SimpleGrid>
    </PanelCard>
  );
}

"use client";

import { Badge, Group, Paper, Progress, SimpleGrid, Stack, Table, Text, Title, Tooltip } from "@mantine/core";
import type { AiOverview, ConversionSummary, TourFunnel } from "@/lib/journey-insights";
import { TOUR_EXIT_REASON_LABELS, type TourExitReason } from "@/lib/journey-insights";
import { QUESTION_OUTCOME_LABELS, QUESTION_TOPIC_LABELS, type QuestionOutcome } from "@/lib/ai/question-log";

export interface JourneyInsightsData {
  periodDays: number;
  tours: Array<TourFunnel & { hotelName: string }>;
  conversion: ConversionSummary;
  ai: AiOverview;
}

const pct = (v: number | null) => (v == null ? "—" : `%${v.toLocaleString("tr-TR")}`);
const secs = (v: number | null) =>
  v == null ? "—" : v >= 60 ? `${Math.floor(v / 60)} dk ${v % 60} sn` : `${v} sn`;
const ms = (v: number | null) => (v == null ? "—" : `${(v / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} sn`);

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={700} size="xl" mt={4}>
        {value}
      </Text>
      {hint && (
        <Text size="xs" c="dimmed" mt={2}>
          {hint}
        </Text>
      )}
    </Paper>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Text size="sm" c="dimmed">
      {children}
    </Text>
  );
}

/** Rehber kullanımı ve dönüşümün özet kartları. */
function Overview({ ai, conversion }: Pick<JourneyInsightsData, "ai" | "conversion">) {
  const answered = ai.byOutcome.cevaplandi ?? 0;
  return (
    <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
      <Stat
        label="Rehbere sorulan soru"
        value={ai.questions.toLocaleString("tr-TR")}
        hint={`Tur: ${ai.bySurface.tur} · Otel sayfası: ${ai.bySurface["otel-sayfasi"]}`}
      />
      <Stat
        label="Doğrulanmış bilgiyle cevaplanan"
        value={pct(ai.questions ? Math.round((answered / ai.questions) * 1000) / 10 : null)}
        hint={`👍 ${ai.feedbackUp} · 👎 ${ai.feedbackDown}`}
      />
      <Stat
        label="Rehbere soranlarda talep oranı"
        value={pct(conversion.askedConversionRate)}
        hint={`Sormayanlarda ${pct(conversion.notAskedConversionRate)} · ${conversion.visits} ziyaret`}
      />
      <Stat label="Cevap süresi (ortanca)" value={ms(ai.medianLatencyMs)} hint={`En yavaş %10: ${ms(ai.p90LatencyMs)} üstü`} />
    </SimpleGrid>
  );
}

/** Bir turun adım adım hunisi: kim nereye kadar izledi, nerede bıraktı. */
function TourFunnelCard({ tour, showHotel }: { tour: JourneyInsightsData["tours"][number]; showHotel: boolean }) {
  const maxReached = Math.max(...tour.steps.map((s) => s.reached), 1);
  const reasons = (Object.entries(tour.exitReasons) as Array<[TourExitReason, number]>).filter(([, n]) => n > 0);
  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" align="flex-start" mb="sm" wrap="wrap">
        <div>
          <Text fw={600}>{showHotel ? `${tour.hotelName} · ${tour.tourId}` : tour.tourId}</Text>
          <Text size="sm" c="dimmed">
            {tour.visits} ziyaret · tamamlayan {pct(tour.completionRate)} · talebe geçen {tour.wentToInquiry} · ortanca izleme{" "}
            {secs(tour.medianWatchSec)}
          </Text>
        </div>
        <Group gap={6}>
          {reasons.map(([reason, n]) => (
            <Badge key={reason} variant="light" color={reason === "talep" ? "green" : "gray"}>
              {TOUR_EXIT_REASON_LABELS[reason]}: {n}
            </Badge>
          ))}
        </Group>
      </Group>
      <Table.ScrollContainer minWidth={520}>
        <Table verticalSpacing={6} fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Adım</Table.Th>
              <Table.Th>Ulaşan</Table.Th>
              <Table.Th>Burada bıraktı</Table.Th>
              <Table.Th>Buradan talebe geçti</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {tour.steps.map((step) => (
              <Table.Tr key={step.stepId}>
                <Table.Td>{step.title}</Table.Td>
                <Table.Td style={{ minWidth: 160 }}>
                  <Group gap={8} wrap="nowrap">
                    <Progress value={(step.reached / maxReached) * 100} w={90} size="sm" />
                    <Text size="sm">{step.reached}</Text>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c={step.dropRate != null && step.dropRate >= 40 ? "red" : undefined} fw={step.droppedHere ? 600 : 400}>
                    {step.droppedHere} {step.reached > 0 && `(${pct(step.dropRate)})`}
                  </Text>
                </Table.Td>
                <Table.Td>{step.inquiryHere || "—"}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Paper>
  );
}

function ConversionSection({ conversion }: { conversion: ConversionSummary }) {
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
      <Paper withBorder p="md" radius="md">
        <Text fw={600}>Talepten hemen önce sorulan son soru</Text>
        <Text size="xs" c="dimmed" mb="sm">
          Misafir talep göndermeden önce rehbere en son ne sordu.
        </Text>
        {conversion.lastQuestionBeforeInquiry.length === 0 ? (
          <Empty>Bu dönemde sorudan sonra gelen talep yok.</Empty>
        ) : (
          <Stack gap={6}>
            {conversion.lastQuestionBeforeInquiry.map((q) => (
              <Group key={q.key} justify="space-between" wrap="nowrap" gap="sm">
                <Text size="sm" style={{ overflowWrap: "anywhere" }}>
                  {q.question}
                </Text>
                <Badge variant="light">{q.count} talep</Badge>
              </Group>
            ))}
          </Stack>
        )}
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Text fw={600}>Konuya göre talep oranı</Text>
        <Text size="xs" c="dimmed" mb="sm">
          Bu konuda soru soran ziyaretlerin yüzde kaçı sonra talep gönderdi.
        </Text>
        {conversion.byTopic.length === 0 ? (
          <Empty>Bu dönemde soru yok.</Empty>
        ) : (
          <Stack gap={8}>
            {conversion.byTopic.map((t) => (
              <div key={t.topic}>
                <Group justify="space-between" gap="sm">
                  <Text size="sm">{QUESTION_TOPIC_LABELS[t.topic] ?? t.topic}</Text>
                  <Text size="sm" c="dimmed">
                    {t.convertedVisits}/{t.askedVisits} · {pct(t.conversionRate)}
                  </Text>
                </Group>
                <Progress value={t.conversionRate ?? 0} size="xs" mt={4} />
              </div>
            ))}
          </Stack>
        )}
      </Paper>

      <Paper withBorder p="md" radius="md" style={{ gridColumn: "1 / -1" }}>
        <Text fw={600}>Soru bazında talep oranı</Text>
        <Text size="xs" c="dimmed" mb="sm">
          En az iki farklı ziyarette sorulan sorular; talebe dönüşenler önce.
        </Text>
        {conversion.byQuestion.length === 0 ? (
          <Empty>Yeterli veri yok — aynı soru en az iki ziyarette sorulmalı.</Empty>
        ) : (
          <Table.ScrollContainer minWidth={520}>
            <Table verticalSpacing={6} fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Soru</Table.Th>
                  <Table.Th>Konu</Table.Th>
                  <Table.Th>Soran ziyaret</Table.Th>
                  <Table.Th>Sonra talep</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {conversion.byQuestion.map((q) => (
                  <Table.Tr key={q.key}>
                    <Table.Td style={{ overflowWrap: "anywhere" }}>{q.question}</Table.Td>
                    <Table.Td>{q.topic ? QUESTION_TOPIC_LABELS[q.topic] : "—"}</Table.Td>
                    <Table.Td>{q.askedVisits}</Table.Td>
                    <Table.Td>
                      {q.convertedVisits} ({pct(q.conversionRate)})
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>
    </SimpleGrid>
  );
}

function OutcomeBar({ ai }: { ai: AiOverview }) {
  const entries = (Object.entries(ai.byOutcome) as Array<[QuestionOutcome, number]>).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  const colors: Record<QuestionOutcome, string> = { cevaplandi: "green", "bilgi-yok": "red", yonlendirme: "blue", model: "yellow" };
  return (
    <Paper withBorder p="md" radius="md">
      <Text fw={600} mb="sm">
        Rehber cevaplarının sonucu
      </Text>
      <Progress.Root size="lg">
        {entries.map(([outcome, n]) => (
          <Tooltip key={outcome} label={`${QUESTION_OUTCOME_LABELS[outcome]}: ${n}`}>
            <Progress.Section value={(n / ai.questions) * 100} color={colors[outcome]} />
          </Tooltip>
        ))}
      </Progress.Root>
      <Group gap="md" mt="sm">
        {entries.map(([outcome, n]) => (
          <Text key={outcome} size="sm">
            <Text span c={colors[outcome]} fw={700}>
              ●
            </Text>{" "}
            {QUESTION_OUTCOME_LABELS[outcome]}: {n}
          </Text>
        ))}
      </Group>
      <Text size="xs" c="dimmed" mt="sm">
        Token: {ai.inputTokens.toLocaleString("tr-TR")} girdi · {ai.outputTokens.toLocaleString("tr-TR")} çıktı
      </Text>
    </Paper>
  );
}

/**
 * Yolculuk analizi — rehber özeti, tur çıkışları, soru → talep. Admin
 * (tüm oteller) ve otel paneli (tek otel) ortak kullanır.
 */
export function JourneyInsightsView({ data, showHotel = false }: { data: JourneyInsightsData; showHotel?: boolean }) {
  return (
    <Stack gap="xl">
      <Overview ai={data.ai} conversion={data.conversion} />
      <OutcomeBar ai={data.ai} />

      <Stack gap="sm">
        <div>
          <Title order={3}>Video tur: hangi adımda çıkıldı</Title>
          <Text size="sm" c="dimmed">
            Her adıma kaç ziyaretçinin ulaştığı ve turu nerede bıraktığı. Talebe geçenler bırakmış sayılmaz.
          </Text>
        </div>
        {data.tours.length === 0 ? (
          <Empty>Bu dönemde izlenen tur yok.</Empty>
        ) : (
          data.tours.map((tour) => <TourFunnelCard key={`${tour.hotelSlug}-${tour.tourId}`} tour={tour} showHotel={showHotel} />)
        )}
      </Stack>

      <Stack gap="sm">
        <div>
          <Title order={3}>Soru → talep</Title>
          <Text size="sm" c="dimmed">
            Rehbere sorulan sorular ile aynı ziyarette gönderilen talepler arasındaki bağ.
          </Text>
        </div>
        <ConversionSection conversion={data.conversion} />
      </Stack>
    </Stack>
  );
}

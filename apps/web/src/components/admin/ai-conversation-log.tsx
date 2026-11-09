"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Drawer,
  Group,
  Loader,
  Pagination,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Timeline,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { QUESTION_OUTCOME_LABELS, QUESTION_TOPIC_LABELS, CHAT_SURFACE_LABELS } from "@/lib/ai/question-log";
import { ALL_EVENT_LABELS } from "@/lib/schemas/analytics";
import { TOUR_EXIT_REASON_LABELS } from "@/lib/journey-insights";

interface ConversationItem {
  id: string;
  createdAt: string;
  visitId: string | null;
  hotelName: string;
  question: string | null;
  answer: string | null;
  topic: string | null;
  outcome: string | null;
  source: string | null;
  surface: string;
  stepId: string | null;
  tourId: string | null;
  tools: string[];
  latencyMs: number | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  textPruned: boolean;
}

interface VisitEvent {
  id: string;
  eventType: string;
  hotelSlug: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

const OUTCOME_COLORS: Record<string, string> = { cevaplandi: "green", "bilgi-yok": "red", yonlendirme: "blue", model: "yellow" };
const time = (iso: string) =>
  new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });

const EVENT_LABELS = ALL_EVENT_LABELS;

/** Yolculuk zaman çizelgesinde bir olayın tek satırlık özeti. */
function describe(e: VisitEvent): string | null {
  const p = e.payload;
  switch (e.eventType) {
    case "tour_step_view":
      return `Adım: ${p.stepId} (${p.stepsSeenCount}/${p.totalSteps})`;
    case "tour_exit":
      return `${TOUR_EXIT_REASON_LABELS[(p.reason as keyof typeof TOUR_EXIT_REASON_LABELS) ?? "bilinmiyor"] ?? p.reason} · son adım ${p.stepId} · ${p.watchedSec} sn izledi`;
    case "ai_question":
      return p.question ? `“${p.question}”` : "(metin saklama süresi dolduğu için silindi)";
    case "ai_feedback":
      return p.rating === "up" ? "👍" : "👎";
    case "inquiry_submit":
      return p.source ? `Kaynak: ${p.source}` : null;
    case "page_view":
      return typeof p.page === "string" ? p.page : null;
    default:
      return typeof p.tourId === "string" ? `Tur: ${p.tourId}` : null;
  }
}

/** Teknik olaylar (token sayacı, güvenlik filtresi) yolculuk çizelgesinde gösterilmez. */
const HIDDEN_IN_TIMELINE = new Set(["ai_usage", "ai_guard_triggered", "ai_completion_drift"]);

function VisitDrawer({ visitId, onClose }: { visitId: string | null; onClose: () => void }) {
  const [events, setEvents] = useState<VisitEvent[] | null>(null);

  useEffect(() => {
    if (!visitId) return;
    setEvents(null);
    fetch(`/api/admin/visits/${visitId}`)
      .then((r) => r.json())
      .then((json) =>
        setEvents(json.ok ? (json.events as VisitEvent[]).filter((e) => !HIDDEN_IN_TIMELINE.has(e.eventType)) : []),
      )
      .catch(() => setEvents([]));
  }, [visitId]);

  return (
    <Drawer opened={Boolean(visitId)} onClose={onClose} position="right" size="lg" title="Ziyaretçi yolculuğu">
      {!events ? (
        <Loader size="sm" />
      ) : events.length === 0 ? (
        <Text size="sm" c="dimmed">
          Bu ziyarete ait olay bulunamadı.
        </Text>
      ) : (
        <Timeline bulletSize={14} lineWidth={2}>
          {events.map((e) => (
            <Timeline.Item
              key={e.id}
              color={e.eventType === "inquiry_submit" ? "green" : e.eventType === "tour_exit" ? "red" : undefined}
              title={
                <Group gap={6}>
                  <Text size="sm" fw={600}>
                    {EVENT_LABELS[e.eventType] ?? e.eventType}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {time(e.createdAt)}
                  </Text>
                </Group>
              }
            >
              {describe(e) && (
                <Text size="sm" c="dimmed" style={{ overflowWrap: "anywhere" }}>
                  {describe(e)}
                </Text>
              )}
              {e.eventType === "ai_question" && typeof e.payload.answer === "string" && (
                <Text size="sm" mt={4} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                  {e.payload.answer}
                </Text>
              )}
            </Timeline.Item>
          ))}
        </Timeline>
      )}
    </Drawer>
  );
}

/**
 * Rehber konuşma kaydı — her soru, verilen cevap ve ölçümleri; süzgeçli.
 * Dönem/otel değişince çağıran bileşen `key` ile yeniden kurar (sayfa 1'e döner).
 */
export function AiConversationLog({ period, hotelId }: { period: string; hotelId: string | null }) {
  const [items, setItems] = useState<ConversationItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [surface, setSurface] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [visitId, setVisitId] = useState<string | null>(null);
  const pageSize = 25;

  const load = useCallback(async () => {
    const params = new URLSearchParams({ period, sayfa: String(page) });
    if (hotelId) params.set("hotelId", hotelId);
    if (outcome) params.set("outcome", outcome);
    if (surface) params.set("surface", surface);
    if (query) params.set("q", query);
    setItems(null);
    const json = await fetch(`/api/admin/ai-conversations?${params}`)
      .then((r) => r.json())
      .catch(() => null);
    setItems(json?.ok ? json.items : []);
    setTotal(json?.ok ? json.total : 0);
  }, [period, hotelId, outcome, surface, query, page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Stack gap="sm">
      <Group gap="sm" align="flex-end" wrap="wrap">
        <Select
          label="Sonuç"
          placeholder="Tümü"
          clearable
          data={Object.entries(QUESTION_OUTCOME_LABELS).map(([value, label]) => ({ value, label }))}
          value={outcome}
          onChange={(v) => {
            setOutcome(v);
            setPage(1);
          }}
          w={180}
        />
        <Select
          label="Nerede"
          placeholder="Tümü"
          clearable
          data={Object.entries(CHAT_SURFACE_LABELS).map(([value, label]) => ({ value, label }))}
          value={surface}
          onChange={(v) => {
            setSurface(v);
            setPage(1);
          }}
          w={160}
        />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search.trim());
            setPage(1);
          }}
          style={{ flex: "1 1 240px" }}
        >
          <TextInput
            label="Soru ya da cevapta ara"
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            onBlur={() => {
              if (search.trim() === query) return;
              setQuery(search.trim());
              setPage(1);
            }}
          />
        </form>
      </Group>

      <Text size="sm" c="dimmed">
        {total.toLocaleString("tr-TR")} kayıt
      </Text>

      {!items ? (
        <Loader size="sm" />
      ) : items.length === 0 ? (
        <Text size="sm" c="dimmed">
          Bu süzgeçlerle kayıt yok.
        </Text>
      ) : (
        <Stack gap="sm">
          {items.map((item) => (
            <Paper key={item.id} withBorder p="md" radius="md">
              <Group justify="space-between" gap="xs" wrap="wrap" mb={6}>
                <Group gap={6} wrap="wrap">
                  {item.outcome && (
                    <Badge color={OUTCOME_COLORS[item.outcome] ?? "gray"} variant="light">
                      {QUESTION_OUTCOME_LABELS[item.outcome as keyof typeof QUESTION_OUTCOME_LABELS] ?? item.outcome}
                    </Badge>
                  )}
                  <Badge variant="outline" color="gray">
                    {CHAT_SURFACE_LABELS[item.surface as keyof typeof CHAT_SURFACE_LABELS] ?? item.surface}
                  </Badge>
                  {item.topic && (
                    <Badge variant="outline" color="gray">
                      {QUESTION_TOPIC_LABELS[item.topic as keyof typeof QUESTION_TOPIC_LABELS] ?? item.topic}
                    </Badge>
                  )}
                  <Text size="xs" c="dimmed">
                    {item.hotelName} · {time(item.createdAt)}
                    {item.stepId ? ` · adım ${item.stepId}` : ""}
                  </Text>
                </Group>
                {item.visitId && (
                  <Button size="compact-xs" variant="subtle" onClick={() => setVisitId(item.visitId)}>
                    Ziyareti gör
                  </Button>
                )}
              </Group>
              {item.textPruned ? (
                <Text size="sm" c="dimmed">
                  Metin 90 günlük saklama süresi dolduğu için silindi.
                </Text>
              ) : (
                <>
                  <Text size="sm" fw={600} style={{ overflowWrap: "anywhere" }}>
                    {item.question}
                  </Text>
                  <Text size="sm" mt={4} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                    {item.answer || "—"}
                  </Text>
                </>
              )}
              <Text size="xs" c="dimmed" mt={6}>
                {item.source === "sunucu" ? "Sunucu kuralı" : (item.model ?? "Model")}
                {item.latencyMs != null && ` · ${(item.latencyMs / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} sn`}
                {item.inputTokens != null && ` · ${item.inputTokens}/${item.outputTokens ?? 0} token`}
                {item.tools.length > 0 && ` · araçlar: ${item.tools.join(", ")}`}
              </Text>
            </Paper>
          ))}
        </Stack>
      )}

      {total > pageSize && (
        <Pagination total={Math.ceil(total / pageSize)} value={page} onChange={setPage} mt="sm" />
      )}

      <VisitDrawer visitId={visitId} onClose={() => setVisitId(null)} />
    </Stack>
  );
}

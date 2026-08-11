"use client";

import { Badge, Paper, Stack, Text } from "@mantine/core";
import type { AiFactCard, AiPriceCard } from "@/lib/ai/types";

const KIND_COLORS: Record<AiFactCard["kind"], string> = {
  verified: "teal",
  otel_ifadesi: "yellow",
  policy: "blue",
};

export function TourGuidePriceCards({ cards }: { cards: AiPriceCard[] }) {
  if (cards.length === 0) return null;

  return (
    <Stack gap="xs" mt={8}>
      {cards.map((card) => (
        <Paper
          key={card.roomSlug}
          p="sm"
          radius="md"
          style={{
            background: "var(--er-surface)",
            border: "1px solid var(--er-line)",
          }}
        >
          <Text size="sm" fw={600} c="var(--er-primary)" mb={6}>
            {card.roomName}
          </Text>
          <Stack gap={4}>
            {card.lines.map((line) => (
              <Text key={`${line.label}-${line.value}`} size="xs" c="var(--er-text)">
                <Text span fw={600}>
                  {line.label}:{" "}
                </Text>
                {line.value}
              </Text>
            ))}
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}

export function TourGuideFactCards({
  cards,
  sourceLanguageNote,
}: {
  cards: AiFactCard[];
  /**
   * Konuşma Türkçe dışında bir dile geçtiğinde gösterilir — fact metni her
   * zaman orijinal (Türkçe) haliyle kalır, çevrilmez; misafir bunu bilmeli.
   */
  sourceLanguageNote?: string;
}) {
  if (cards.length === 0) return null;

  return (
    <Stack gap="xs" mt={8}>
      {cards.map((card, i) => (
        <Paper
          key={`${card.label}-${i}`}
          p="sm"
          radius="md"
          style={{
            background: "var(--er-surface)",
            border: "1px solid var(--er-line)",
          }}
        >
          <Badge size="xs" variant="light" color={KIND_COLORS[card.kind]} mb={6}>
            {card.label}
          </Badge>
          {card.title && (
            <Text size="sm" fw={600} c="var(--er-text)" mb={4}>
              {card.title}
            </Text>
          )}
          <Text size="xs" c="var(--er-text-muted)" style={{ lineHeight: 1.6 }}>
            {card.text}
          </Text>
          {sourceLanguageNote && (
            <Text size="xs" fs="italic" mt={4} style={{ color: "var(--er-text-dim)" }}>
              {sourceLanguageNote}
            </Text>
          )}
        </Paper>
      ))}
    </Stack>
  );
}

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
            background: "rgba(51,53,53,0.55)",
            border: "0.5px solid rgba(212,175,55,0.28)",
          }}
        >
          <Text size="sm" fw={600} c="var(--lux-gold)" mb={6}>
            {card.roomName}
          </Text>
          <Stack gap={4}>
            {card.lines.map((line) => (
              <Text key={`${line.label}-${line.value}`} size="xs" c="var(--lux-text)">
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

export function TourGuideFactCards({ cards }: { cards: AiFactCard[] }) {
  if (cards.length === 0) return null;

  return (
    <Stack gap="xs" mt={8}>
      {cards.map((card, i) => (
        <Paper
          key={`${card.label}-${i}`}
          p="sm"
          radius="md"
          style={{
            background: "rgba(51,53,53,0.55)",
            border: "0.5px solid rgba(153,144,126,0.32)",
          }}
        >
          <Badge size="xs" variant="light" color={KIND_COLORS[card.kind]} mb={6}>
            {card.label}
          </Badge>
          {card.title && (
            <Text size="sm" fw={600} c="var(--lux-text)" mb={4}>
              {card.title}
            </Text>
          )}
          <Text size="xs" c="var(--lux-muted)" style={{ lineHeight: 1.6 }}>
            {card.text}
          </Text>
        </Paper>
      ))}
    </Stack>
  );
}

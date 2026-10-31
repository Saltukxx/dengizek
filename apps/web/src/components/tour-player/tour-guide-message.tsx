"use client";

import { ActionIcon, Box, Group, Loader, Stack, Text } from "@mantine/core";
import { IconThumbDown, IconThumbDownFilled, IconThumbUp, IconThumbUpFilled } from "@tabler/icons-react";
import type { GuideMessage } from "@/lib/tour/use-tour-guide";
import { detectLanguageHint } from "@/lib/ai/language-detect";
import { guideStrings } from "./tour-guide-i18n";
import { TourGuideFactCards, TourGuidePriceCards } from "./tour-guide-cards";

interface TourGuideMessageProps {
  message: GuideMessage;
  /** Sohbette tespit edilen dil (tr/en) — çerçeve metinleri buna uyar. */
  detectedLanguage?: string;
  personaInitials?: string;
  /** Verilirse cevabın altında 👍/👎 gösterilir (yalnız misafir sorusuna verilen cevaplarda). */
  onFeedback?: (rating: "up" | "down") => void;
  /** Bu cevaba verilmiş oy. */
  feedback?: "up" | "down";
}

export function TourGuideMessage({
  message,
  detectedLanguage,
  personaInitials = "?",
  onFeedback,
  feedback,
}: TourGuideMessageProps) {
  const isUser = message.role === "user";
  const strings = guideStrings(detectedLanguage);

  if (message.isThinking) {
    return (
      <Box
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 0",
          background: "transparent",
          maxWidth: "80%",
          alignSelf: "flex-start",
          color: "var(--er-text-dim)",
        }}
      >
        <Loader size={14} color="blue" type="dots" />
        <Text size="xs" fs="italic" style={{ color: "var(--er-text-dim)" }}>
          {strings.thinking}
        </Text>
      </Box>
    );
  }

  return (
    <Box
      style={{
        display: "flex",
        flexDirection: isUser ? "column" : "row",
        alignSelf: isUser ? "flex-end" : "flex-start",
        alignItems: isUser ? "flex-end" : "flex-start",
        maxWidth: isUser ? "84%" : "95%",
        gap: 14,
      }}
    >
      {!isUser && (
        <Box
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "var(--er-primary-tint)",
            display: "grid",
            placeItems: "center",
            color: "var(--er-primary)",
            fontFamily: "var(--er-font-display)",
            fontWeight: 700,
            fontSize: 11,
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          {personaInitials}
        </Box>
      )}
      <Box
        style={{
          flex: 1,
          minWidth: 0,
          padding: "12px 16px",
          borderRadius: "var(--er-radius-md)",
          background: isUser ? "var(--er-primary)" : "var(--er-surface-2)",
          border: isUser ? "none" : "1px solid var(--er-line)",
        }}
      >
        <Stack gap={0}>
          <Text
            size="sm"
            style={{
              color: isUser ? "#fff" : "var(--er-text)",
              lineHeight: 1.72,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontFamily: "var(--er-font-sans)",
            }}
          >
            {message.content}
          </Text>
          {!isUser && message.priceCards && message.priceCards.length > 0 && (
            <TourGuidePriceCards cards={message.priceCards} />
          )}
          {!isUser && message.factCards && message.factCards.length > 0 && (
            <TourGuideFactCards
              cards={message.factCards}
              sourceLanguageNote={
                (detectLanguageHint(message.content) ?? "tr") === "tr"
                  ? undefined
                  : strings.sourceTurkish
              }
            />
          )}
          {!isUser && onFeedback && message.content.trim() ? (
            <Group gap={2} mt={6} justify="flex-end" aria-live="polite">
              {feedback ? (
                <Text size="xs" mr={4} style={{ color: "var(--er-text-dim)" }}>
                  {strings.feedbackThanks}
                </Text>
              ) : null}
              <ActionIcon
                variant="subtle"
                size="sm"
                color={feedback === "up" ? "teal" : "gray"}
                aria-label={strings.helpful}
                title={strings.helpful}
                aria-pressed={feedback === "up"}
                onClick={() => onFeedback("up")}
              >
                {feedback === "up" ? <IconThumbUpFilled size={14} /> : <IconThumbUp size={14} />}
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                size="sm"
                color={feedback === "down" ? "red" : "gray"}
                aria-label={strings.notHelpful}
                title={strings.notHelpful}
                aria-pressed={feedback === "down"}
                onClick={() => onFeedback("down")}
              >
                {feedback === "down" ? <IconThumbDownFilled size={14} /> : <IconThumbDown size={14} />}
              </ActionIcon>
            </Group>
          ) : null}
        </Stack>
      </Box>
    </Box>
  );
}

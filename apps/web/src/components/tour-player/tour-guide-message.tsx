"use client";

import { Box, Loader, Stack, Text } from "@mantine/core";
import type { GuideMessage } from "@/lib/tour/use-tour-guide";
import { detectLanguageHint } from "@/lib/ai/language-detect";
import { guideStrings } from "./tour-guide-i18n";
import { TourGuideFactCards, TourGuidePriceCards } from "./tour-guide-cards";

interface TourGuideMessageProps {
  message: GuideMessage;
  /** Sohbette tespit edilen dil (tr/en) — çerçeve metinleri buna uyar. */
  detectedLanguage?: string;
}

export function TourGuideMessage({ message, detectedLanguage }: TourGuideMessageProps) {
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
          AE
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
        </Stack>
      </Box>
    </Box>
  );
}

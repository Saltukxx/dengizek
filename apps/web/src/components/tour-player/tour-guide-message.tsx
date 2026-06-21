"use client";

import { Box, Loader, Stack, Text } from "@mantine/core";
import type { GuideMessage } from "@/lib/tour/use-tour-guide";
import { TourGuideFactCards, TourGuidePriceCards } from "./tour-guide-cards";

interface TourGuideMessageProps {
  message: GuideMessage;
}

export function TourGuideMessage({ message }: TourGuideMessageProps) {
  const isUser = message.role === "user";

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
          color: "rgba(208,197,178,0.66)",
        }}
      >
        <Loader size={14} color="yellow" type="dots" />
        <Text size="xs" fs="italic" style={{ color: "rgba(208,197,178,0.66)" }}>
          Düşünüyor…
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
            border: "0.5px solid rgba(212,175,55,0.38)",
            display: "grid",
            placeItems: "center",
            color: "var(--lux-gold)",
            fontFamily: "var(--lux-font-editorial)",
            fontStyle: "italic",
            fontSize: 10,
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
          padding: isUser ? "16px 20px" : "3px 0",
          borderRadius: isUser ? 8 : 0,
          background: isUser ? "rgba(51,53,53,0.82)" : "transparent",
          border: isUser ? "0.5px solid rgba(153,144,126,0.32)" : "none",
        }}
      >
        <Stack gap={0}>
          <Text
            size="sm"
            style={{
              color: isUser ? "var(--lux-text)" : "var(--lux-muted)",
              lineHeight: 1.72,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontFamily: "var(--lux-font-sans)",
            }}
          >
            {message.content}
          </Text>
          {!isUser && message.priceCards && message.priceCards.length > 0 && (
            <TourGuidePriceCards cards={message.priceCards} />
          )}
          {!isUser && message.factCards && message.factCards.length > 0 && (
            <TourGuideFactCards cards={message.factCards} />
          )}
        </Stack>
      </Box>
    </Box>
  );
}

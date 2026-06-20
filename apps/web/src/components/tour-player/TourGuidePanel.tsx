"use client";

import {
  Box,
  Divider,
  Group,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconSend } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import type { GuideMessage } from "@/lib/tour/use-tour-guide";
import { AutoTourButton } from "./auto-tour-button";
import { TourGuideChips } from "./tour-guide-chips";
import { TourGuideMessage } from "./tour-guide-message";

interface TourGuidePanelProps {
  messages: GuideMessage[];
  isThinking: boolean;
  isAutoTour: boolean;
  hotelName?: string;
  onSendMessage: (text: string) => void;
  onChipClick: (chip: string) => void;
  onStartAutoTour: () => void;
  onStopAutoTour: () => void;
}

export function TourGuidePanel({
  messages,
  isThinking,
  isAutoTour,
  hotelName,
  onSendMessage,
  onChipClick,
  onStartAutoTour,
  onStopAutoTour,
}: TourGuidePanelProps) {
  const [inputValue, setInputValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Yeni mesaj gelince en alta kaydır
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  const handleSend = () => {
    const text = inputValue.trim();
    if (!text || isThinking) return;
    setInputValue("");
    onSendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Son mesajın chip'lerini göster
  const lastAssistantMessage = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && !m.isThinking && m.chips?.length);

  return (
    <Stack
      gap={0}
      style={{
        height: "100%",
        background: "rgba(18, 20, 20, 0.94)",
        borderLeft: "0.5px solid rgba(153,144,126,0.35)",
        borderRadius: 0,
        overflow: "hidden",
        color: "var(--lux-text)",
        fontFamily: "var(--lux-font-sans)",
      }}
    >
      {/* Header */}
      <Box
        px={32}
        py={30}
        style={{
          background: "rgba(18,20,20,0.35)",
          borderBottom: "0.5px solid rgba(153,144,126,0.28)",
          flexShrink: 0,
        }}
      >
        <Group justify="space-between" align="center" gap="xs">
          <Group gap="xs" align="center">
            <Box
              style={{
                width: 42,
                height: 42,
                borderRadius: "50%",
                background: "rgba(31,32,33,0.88)",
                border: "0.5px solid rgba(212,175,55,0.48)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                color: "var(--lux-gold)",
                fontFamily: "var(--lux-font-editorial)",
                fontStyle: "italic",
                fontSize: 13,
              }}
            >
              AE
            </Box>
            <Stack gap={0}>
              <Text
                size="xs"
                fw={800}
                lh={1.2}
                style={{ letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--lux-text)" }}
              >
                Aurelia Concierge
              </Text>
              {hotelName && (
                <Text size="xs" lh={1.2} mt={5} style={{ color: "rgba(212,175,55,0.72)" }}>
                  Sizin için buradayım
                </Text>
              )}
            </Stack>
          </Group>
          <AutoTourButton
            isAutoTour={isAutoTour}
            onStart={onStartAutoTour}
            onStop={onStopAutoTour}
            disabled={isThinking}
          />
        </Group>
      </Box>

      {/* Mesaj listesi */}
      <ScrollArea
        viewportRef={scrollRef}
        style={{ flex: 1, minHeight: 0 }}
        p={0}
        scrollbars="y"
      >
        <Stack gap={28} style={{ padding: "28px 32px", minHeight: "100%", justifyContent: "flex-end" }}>
          {messages.length === 0 && !isThinking && (
            <Text size="sm" ta="center" py="md" style={{ color: "rgba(208,197,178,0.62)" }}>
              Rehberiniz hazırlanıyor…
            </Text>
          )}
          {messages.map((msg) => (
            <TourGuideMessage key={msg.id} message={msg} />
          ))}
        </Stack>
      </ScrollArea>

      {/* Chip önerileri */}
      {lastAssistantMessage?.chips && !isThinking && (
        <>
          <Divider color="rgba(153,144,126,0.24)" />
          <Box px={32} py={12} style={{ flexShrink: 0 }}>
            <TourGuideChips
              chips={lastAssistantMessage.chips}
              onChipClick={onChipClick}
              disabled={isThinking}
            />
          </Box>
        </>
      )}

      {/* Metin girişi */}
      <Divider color="rgba(153,144,126,0.28)" />
      <Box px={32} py={22} style={{ flexShrink: 0 }}>
        <TextInput
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          placeholder="Bir soru sorun..."
          disabled={isThinking}
          size="sm"
          radius={0}
          rightSection={
            <Box
              component="button"
              onClick={handleSend}
              disabled={!inputValue.trim() || isThinking}
              aria-label="Gönder"
              style={{
                background: "none",
                border: "none",
                cursor: inputValue.trim() && !isThinking ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: inputValue.trim() && !isThinking
                  ? "var(--lux-gold)"
                  : "rgba(208,197,178,0.42)",
                padding: 4,
              }}
            >
              <IconSend size={16} />
            </Box>
          }
          styles={{
            input: {
              background: "transparent",
              border: "none",
              borderBottom: "0.5px solid rgba(153,144,126,0.44)",
              color: "var(--lux-text)",
              fontFamily: "var(--lux-font-sans)",
              paddingLeft: 0,
              "&::placeholder": { color: "rgba(208,197,178,0.46)" },
            },
          }}
        />
      </Box>
    </Stack>
  );
}

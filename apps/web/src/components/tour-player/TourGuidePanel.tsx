"use client";

import {
  ActionIcon,
  Box,
  Divider,
  Group,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconMicrophone, IconMicrophoneOff, IconSend } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import type { GuideMessage } from "@/lib/tour/use-tour-guide";
import { AutoTourButton } from "./auto-tour-button";
import { guideStrings, speechLocaleFor } from "./tour-guide-i18n";
import { TourGuideChips } from "./tour-guide-chips";
import { TourGuideMessage } from "./tour-guide-message";
import { useSpeechInput } from "./use-speech-input";

interface TourGuidePanelProps {
  messages: GuideMessage[];
  isThinking: boolean;
  isAutoTour: boolean;
  hotelName?: string;
  /** Otelin yayınlanmış AI persona adı (manifest.hotelProfile.aiPersona). */
  personaName?: string;
  /** Sohbette tespit edilen dil (tr/en) — panel metinleri ve STT dili buna uyar. */
  detectedLanguage?: string;
  onSendMessage: (text: string) => void;
  onChipClick: (chip: string) => void;
  onStartAutoTour: () => void;
  onStopAutoTour: () => void;
}

/** Persona adından avatar baş harfleri — ilk iki kelimenin ilk harfleri. */
export function personaInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join("")
    .toLocaleUpperCase("tr-TR");
}

export function TourGuidePanel({
  messages,
  isThinking,
  isAutoTour,
  hotelName,
  personaName,
  detectedLanguage,
  onSendMessage,
  onChipClick,
  onStartAutoTour,
  onStopAutoTour,
}: TourGuidePanelProps) {
  const [inputValue, setInputValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const strings = guideStrings(detectedLanguage);

  // Ses girişi — transkript input alanına yazılır, kullanıcı gözden geçirip
  // kendisi gönderir (v1'de otomatik gönderme yok, kasıtlı olarak).
  // STT dili sohbette tespit edilen dile bağlanır; henüz tespit yoksa
  // use-speech-input tarayıcı diline düşer.
  const { isListening, isSupported: speechSupported, start: startListening, stop: stopListening } =
    useSpeechInput({
      lang: speechLocaleFor(detectedLanguage),
      onResult: (text) => setInputValue(text),
    });

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

  const displayPersona = personaName?.trim() || strings.defaultPersona;

  // Son mesajın chip'lerini göster
  const lastAssistantMessage = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && !m.isThinking && m.chips?.length);

  return (
    <Stack
      gap={0}
      style={{
        height: "100%",
        background: "var(--er-surface)",
        borderLeft: "0.5px solid var(--er-line)",
        borderRadius: 0,
        overflow: "hidden",
        color: "var(--er-text)",
        fontFamily: "var(--er-font-sans)",
      }}
    >
      {/* Header */}
      <Box
        px={20}
        py={16}
        style={{
          background: "var(--er-surface)",
          borderBottom: "1px solid var(--er-line)",
          flexShrink: 0,
        }}
      >
        <Group justify="space-between" align="center" gap="xs">
          <Group gap={10} align="center">
            <Box
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "var(--er-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                color: "#fff",
                fontFamily: "var(--er-font-display)",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {personaInitials(displayPersona)}
            </Box>
            <Stack gap={0}>
              <Text
                size="xs"
                fw={700}
                lh={1.2}
                style={{ letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--er-text)" }}
              >
                {displayPersona}
              </Text>
              {hotelName && (
                <Text size="xs" lh={1.2} mt={4} style={{ color: "var(--er-text-dim)" }}>
                  {strings.hereForYou}
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
        <Stack gap={20} style={{ padding: "20px", minHeight: "100%", justifyContent: "flex-end" }}>
          {messages.length === 0 && !isThinking && (
            <Text size="sm" ta="center" py="md" style={{ color: "var(--er-text-dim)" }}>
              {strings.preparing}
            </Text>
          )}
          {messages.map((msg) => (
            <TourGuideMessage key={msg.id} message={msg} detectedLanguage={detectedLanguage} />
          ))}
        </Stack>
      </ScrollArea>

      {/* Chip önerileri */}
      {lastAssistantMessage?.chips && !isThinking && (
        <>
          <Divider color="var(--er-line)" />
          <Box px={20} py={12} style={{ flexShrink: 0 }}>
            <TourGuideChips
              chips={lastAssistantMessage.chips}
              onChipClick={onChipClick}
              disabled={isThinking}
            />
          </Box>
        </>
      )}

      {/* Metin girişi */}
      <Divider color="var(--er-line)" />
      <Box px={20} py={16} style={{ flexShrink: 0 }}>
        <TextInput
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          placeholder={strings.inputPlaceholder}
          disabled={isThinking}
          size="md"
          radius={999}
          rightSectionWidth={speechSupported ? 64 : 32}
          rightSection={
            <Group gap={2} wrap="nowrap" pr={4}>
              {speechSupported && (
                <ActionIcon
                  type="button"
                  variant="subtle"
                  size="sm"
                  disabled={isThinking}
                  onClick={() => (isListening ? stopListening() : startListening())}
                  aria-label={isListening ? strings.voiceStop : strings.voiceStart}
                  style={{ color: isListening ? "var(--er-primary)" : "var(--er-text-dim)" }}
                >
                  {isListening ? <IconMicrophoneOff size={15} /> : <IconMicrophone size={15} />}
                </ActionIcon>
              )}
              <Box
                component="button"
                onClick={handleSend}
                disabled={!inputValue.trim() || isThinking}
                aria-label={strings.send}
                style={{
                  background: "none",
                  border: "none",
                  cursor: inputValue.trim() && !isThinking ? "pointer" : "default",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: inputValue.trim() && !isThinking
                    ? "var(--er-primary)"
                    : "var(--er-text-dim)",
                  padding: 4,
                }}
              >
                <IconSend size={16} />
              </Box>
            </Group>
          }
          styles={{
            input: {
              background: "var(--er-surface-2)",
              border: "1px solid var(--er-line)",
              color: "var(--er-text)",
              fontFamily: "var(--er-font-sans)",
              "&::placeholder": { color: "var(--er-text-dim)" },
            },
          }}
        />
      </Box>
    </Stack>
  );
}

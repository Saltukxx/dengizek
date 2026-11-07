"use client";

import {
  ActionIcon,
  Box,
  Button,
  Divider,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import {
  IconMicrophone,
  IconMicrophoneOff,
  IconPhone,
  IconPhoneOff,
  IconSend,
  IconVolume,
  IconVolumeOff,
} from "@tabler/icons-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { GuideMessage } from "@/lib/tour/use-tour-guide";
import { AutoTourButton } from "./auto-tour-button";
import { guideStrings, speechLocaleFor } from "./tour-guide-i18n";
import { TourGuideChips } from "./tour-guide-chips";
import { TourGuideMessage } from "./tour-guide-message";
import { useSpeechInput } from "./use-speech-input";
import { useSpeechOutput } from "./use-speech-output";
import { useVoiceCall, type VoiceCallState } from "./use-voice-call";
import type { GuideStrings } from "./tour-guide-i18n";

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
  /** Verilmezse otomatik tur düğmesi gösterilmez (ör. otel sayfası sohbeti). */
  onStartAutoTour?: () => void;
  onStopAutoTour?: () => void;
  /** Henüz mesaj yokken gösterilecek içerik (varsayılan: "hazırlanıyor"). */
  emptyState?: ReactNode;
  /** Başlık alanının sağına eklenecek içerik (ör. kapat düğmesi). */
  headerAction?: ReactNode;
  /** Metin girişinin hemen üstünde gösterilecek içerik (ör. talep formu düğmesi). */
  aboveInput?: ReactNode;
  /** Misafir bir cevabı değerlendirdi (👍/👎). question = cevaplanan misafir mesajı. */
  onFeedback?: (input: { messageId: string; rating: "up" | "down"; question: string; answer: string }) => void;
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
  onFeedback,
  emptyState,
  headerAction,
  aboveInput,
}: TourGuidePanelProps) {
  const [inputValue, setInputValue] = useState("");
  const [ratings, setRatings] = useState<Record<string, "up" | "down">>({});
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

  // Sesli yanıt — misafir açarsa cevaplar cümle cümle okunur. Yeni soru ya da
  // mikrofon okumayı keser (rehber kendi sesini dinlemesin).
  const speech = useSpeechOutput({ messages, isThinking, language: detectedLanguage });

  // Sesli sohbet — dinler, misafir susunca gönderir, cevabı okur, yeniden dinler.
  const lastMessage = messages[messages.length - 1];
  const call = useVoiceCall({
    output: speech,
    isThinking,
    lang: speechLocaleFor(detectedLanguage),
    onSend: onSendMessage,
    replyText: lastMessage?.role === "assistant" && !lastMessage.isThinking ? lastMessage.content : "",
    fillerText: strings.callFiller,
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
    speech.stop();
    onSendMessage(text);
  };

  const handleChipClick = (chip: string) => {
    speech.stop();
    onChipClick(chip);
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
          <Group gap={6} wrap="nowrap">
            {call.isSupported && !call.isActive && (
              <Button
                type="button"
                variant="light"
                size="compact-sm"
                radius={999}
                leftSection={<IconPhone size={15} />}
                onClick={() => {
                  stopListening();
                  call.start();
                }}
                disabled={isThinking}
              >
                {strings.callStart}
              </Button>
            )}
            {speech.isSupported && !call.isActive && (
              <ActionIcon
                type="button"
                variant="subtle"
                size="md"
                onClick={speech.toggle}
                aria-pressed={speech.enabled}
                aria-label={speech.enabled ? strings.voiceReplyOff : strings.voiceReplyOn}
                title={speech.enabled ? strings.voiceReplyOff : strings.voiceReplyOn}
                style={{ color: speech.enabled ? "var(--er-primary)" : "var(--er-text-dim)" }}
              >
                {speech.enabled ? <IconVolume size={18} /> : <IconVolumeOff size={18} />}
              </ActionIcon>
            )}
            {onStartAutoTour && onStopAutoTour && (
              <AutoTourButton
                isAutoTour={isAutoTour}
                onStart={onStartAutoTour}
                onStop={onStopAutoTour}
                disabled={isThinking}
              />
            )}
            {headerAction}
          </Group>
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
            emptyState ?? (
              <Text size="sm" ta="center" py="md" style={{ color: "var(--er-text-dim)" }}>
                {strings.preparing}
              </Text>
            )
          )}
          {messages.map((msg, i) => {
            // Yalnız misafirin sorusuna verilen cevap değerlendirilir (tur anlatımı değil).
            const previous = messages[i - 1];
            const question = msg.role === "assistant" && !msg.isThinking && previous?.role === "user" ? previous.content : null;
            return (
              <TourGuideMessage
                key={msg.id}
                message={msg}
                detectedLanguage={detectedLanguage}
                personaInitials={personaInitials(displayPersona)}
                feedback={ratings[msg.id]}
                onFeedback={
                  onFeedback && question
                    ? (rating) => {
                        if (ratings[msg.id] === rating) return;
                        setRatings((r) => ({ ...r, [msg.id]: rating }));
                        onFeedback({ messageId: msg.id, rating, question, answer: msg.content });
                      }
                    : undefined
                }
              />
            );
          })}
        </Stack>
      </ScrollArea>

      {/* Chip önerileri */}
      {lastAssistantMessage?.chips && !isThinking && (
        <>
          <Divider color="var(--er-line)" />
          <Box px={20} py={12} style={{ flexShrink: 0 }}>
            <TourGuideChips
              chips={lastAssistantMessage.chips}
              onChipClick={handleChipClick}
              disabled={isThinking}
            />
          </Box>
        </>
      )}

      {aboveInput && (
        <>
          <Divider color="var(--er-line)" />
          <Box px={20} py={12} style={{ flexShrink: 0 }}>
            {aboveInput}
          </Box>
        </>
      )}

      {/* Metin girişi — sesli sohbette yerini görüşme çubuğu alır */}
      <Divider color="var(--er-line)" />
      <Box px={20} py={16} style={{ flexShrink: 0 }}>
        {call.isActive ? (
          <VoiceCallBar state={call.state} transcript={call.transcript} strings={strings} onTap={call.tap} onEnd={call.end} />
        ) : (
        <>
        {call.error === "mic-denied" && (
          <Text size="xs" mb={8} role="alert" style={{ color: "var(--er-text-muted)" }}>
            {strings.callMicDenied}
          </Text>
        )}
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
                  onClick={() => {
                    if (isListening) return stopListening();
                    speech.stop();
                    startListening();
                  }}
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
        </>
        )}
      </Box>
    </Stack>
  );
}

const CALL_STATUS: Record<Exclude<VoiceCallState, "off">, keyof GuideStrings> = {
  listening: "callListening",
  thinking: "callThinking",
  speaking: "callSpeaking",
  paused: "callPaused",
};

const CALL_ACTION: Partial<Record<VoiceCallState, keyof GuideStrings>> = {
  listening: "callDoneTalking",
  speaking: "callInterrupt",
  paused: "callListenAgain",
};

/** Sesli sohbet sırasında yazı kutusunun yerine gelen durum çubuğu. */
function VoiceCallBar({
  state,
  transcript,
  strings,
  onTap,
  onEnd,
}: {
  state: VoiceCallState;
  transcript: string;
  strings: GuideStrings;
  onTap: () => void;
  onEnd: () => void;
}) {
  if (state === "off") return null;
  const action = CALL_ACTION[state];
  const active = state === "listening" || state === "speaking";
  return (
    <Group justify="space-between" wrap="nowrap" gap={12} aria-live="polite">
      <Group gap={10} wrap="nowrap" style={{ minWidth: 0 }}>
        <Box
          aria-hidden
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: active ? "var(--er-primary)" : "var(--er-surface-2)",
            color: active ? "#fff" : "var(--er-text-dim)",
            border: "1px solid var(--er-line)",
          }}
        >
          {state === "listening" && <IconMicrophone size={18} />}
          {state === "thinking" && <Loader size={16} type="dots" color="var(--er-primary)" />}
          {state === "speaking" && <IconVolume size={18} />}
          {state === "paused" && <IconMicrophoneOff size={18} />}
        </Box>
        <Stack gap={0} style={{ minWidth: 0 }}>
          <Text size="sm" fw={600} style={{ color: "var(--er-text)" }}>
            {strings[CALL_STATUS[state]]}
          </Text>
          {transcript && state !== "speaking" ? (
            <Text size="xs" lineClamp={2} style={{ color: "var(--er-text-muted)" }}>
              {transcript}
            </Text>
          ) : null}
        </Stack>
      </Group>
      <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
        {action && (
          <Button type="button" variant="light" size="compact-sm" radius={999} onClick={onTap}>
            {strings[action]}
          </Button>
        )}
        <Button
          type="button"
          color="red"
          size="compact-sm"
          radius={999}
          leftSection={<IconPhoneOff size={14} />}
          onClick={onEnd}
        >
          {strings.callEnd}
        </Button>
      </Group>
    </Group>
  );
}

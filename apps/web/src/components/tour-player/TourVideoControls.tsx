import { ActionIcon, Button, Group, Stack, Text } from "@mantine/core";
import {
  IconMaximize,
  IconMinimize,
  IconPlayerPause,
  IconPlayerPlay,
  IconSubtitles,
  IconSubtitlesOff,
} from "@tabler/icons-react";
import Link from "next/link";
import { TourVideoSeekBar } from "./tour-video-seek-bar";

type TourVideoControlsProps = {
  playbackSec: number;
  clipMin: number;
  clipMax: number;
  fileDuration: number;
  isPlaying: boolean;
  isFullScreen: boolean;
  captionsOn: boolean;
  captionsAvailable: boolean;
  stepIndex: number;
  totalSteps: number;
  backHref: string;
  backLabel: string;
  reduceMotion: boolean;
  isPausedForInteraction: boolean;
  onSeek: (t: number) => void;
  onTogglePlay: () => void;
  onToggleCaptions: () => void;
  onToggleFullscreen: () => void;
};

export function TourVideoControls({
  playbackSec,
  clipMin,
  clipMax,
  fileDuration,
  isPlaying,
  isFullScreen,
  captionsOn,
  captionsAvailable,
  stepIndex,
  totalSteps,
  backHref,
  backLabel,
  reduceMotion,
  isPausedForInteraction,
  onSeek,
  onTogglePlay,
  onToggleCaptions,
  onToggleFullscreen,
}: TourVideoControlsProps) {
  return (
    <Stack
      p="sm"
      gap="sm"
      pos="absolute"
      bottom={0}
      left={0}
      right={0}
      style={{
        zIndex: 4,
        background: "linear-gradient(transparent 0%, rgba(8,9,10,0.92) 100%)",
        borderTop: "0.5px solid rgba(212,175,55,0.16)",
      }}
    >
      <TourVideoSeekBar
        valueSec={playbackSec}
        minSec={clipMin}
        maxSec={clipMax}
        disabled={isPausedForInteraction || !fileDuration}
        onSeek={onSeek}
        reduceMotion={reduceMotion}
      />
      <Group justify="space-between" align="center" wrap="wrap" gap="xs" style={{ rowGap: 10 }}>
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: "1 1 auto" }}>
          <ActionIcon
            size="lg"
            variant="transparent"
            onClick={onTogglePlay}
            aria-label={isPlaying ? "Duraklat" : "Oynat"}
            disabled={isPausedForInteraction}
            style={{ color: "var(--lux-gold)" }}
          >
            {isPlaying ? <IconPlayerPause size={20} /> : <IconPlayerPlay size={20} />}
          </ActionIcon>
          <Text size="sm" lineClamp={1} style={{ minWidth: 0, color: "var(--lux-muted)" }}>
            Adım {stepIndex + 1} / {totalSteps}
          </Text>
        </Group>
        <Group gap="xs" wrap="nowrap" justify="flex-end" style={{ minWidth: 0, flex: "1 1 120px" }}>
          {captionsAvailable && (
            <ActionIcon
              size="lg"
              variant="transparent"
              onClick={onToggleCaptions}
              aria-pressed={captionsOn}
              aria-label="Altyazıları aç veya kapat"
              style={{ color: "var(--lux-gold)" }}
            >
              {captionsOn ? <IconSubtitles size={20} /> : <IconSubtitlesOff size={20} />}
            </ActionIcon>
          )}
          <ActionIcon
            size="lg"
            variant="transparent"
            onClick={onToggleFullscreen}
            aria-pressed={isFullScreen}
            aria-label={isFullScreen ? "Tam ekrandan çık" : "Tam ekran"}
            style={{ color: "var(--lux-gold)" }}
          >
            {isFullScreen ? <IconMinimize size={20} /> : <IconMaximize size={20} />}
          </ActionIcon>
          <Button
            component={Link}
            href={backHref}
            size="sm"
            variant="subtle"
            style={{ maxWidth: "100%", color: "var(--lux-muted)" }}
            styles={{ label: { overflow: "hidden", textOverflow: "ellipsis" } }}
          >
            {backLabel}
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}

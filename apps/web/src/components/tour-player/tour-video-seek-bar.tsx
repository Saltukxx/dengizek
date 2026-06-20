"use client";

import { Group, Slider, Text } from "@mantine/core";
import { formatTimeLabel } from "@/lib/tour/tour-clip-helpers";

type TourVideoSeekBarProps = {
  valueSec: number;
  minSec: number;
  maxSec: number;
  disabled?: boolean;
  onSeek: (sec: number) => void;
  reduceMotion: boolean;
};

/**
 * Adım klibi penceresinde sarma; min–max dışı değer yok.
 */
export function TourVideoSeekBar({
  valueSec,
  minSec,
  maxSec,
  disabled,
  onSeek,
  reduceMotion,
}: TourVideoSeekBarProps) {
  const span = Math.max(maxSec - minSec, 0.001);
  const safeValue = Math.min(Math.max(valueSec, minSec), maxSec);
  const sliderValue = ((safeValue - minSec) / span) * 100;

  return (
    <div data-testid="tour-seek-bar">
      <Group gap="sm" align="center" wrap="nowrap" style={{ minWidth: 0 }}>
        <Text size="xs" c="white" style={{ flexShrink: 0, width: 40 }} ta="right">
          {formatTimeLabel(safeValue - minSec)}
        </Text>
        <Slider
          flex={1}
          min={0}
          max={100}
          step={0.1}
          value={sliderValue}
          disabled={disabled || span < 0.02}
          onChange={(pct) => {
            const t = minSec + (pct / 100) * span;
            onSeek(t);
          }}
          size="sm"
          color="brand"
          styles={{
            root: { flex: 1, minWidth: 0 },
            track: { "&::before": { background: "rgba(255,255,255,0.25)" } },
          }}
          style={{ transition: reduceMotion ? "none" : undefined }}
          aria-label="Video konumu"
        />
        <Text size="xs" c="white" style={{ flexShrink: 0, width: 40 }} ta="left">
          {formatTimeLabel(maxSec - minSec)}
        </Text>
      </Group>
    </div>
  );
}

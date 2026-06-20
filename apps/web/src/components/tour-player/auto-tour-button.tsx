"use client";

import { Button } from "@mantine/core";
import { IconPlayerPlay, IconPlayerStop } from "@tabler/icons-react";

interface AutoTourButtonProps {
  isAutoTour: boolean;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
}

export function AutoTourButton({ isAutoTour, onStart, onStop, disabled }: AutoTourButtonProps) {
  if (isAutoTour) {
    return (
      <Button
        size="xs"
        variant="outline"
        radius={0}
        leftSection={<IconPlayerStop size={14} />}
        onClick={onStop}
        disabled={disabled}
        styles={{
          root: {
            borderColor: "rgba(212,175,55,0.45)",
            color: "var(--lux-gold)",
            background: "rgba(212,175,55,0.08)",
            fontFamily: "var(--lux-font-sans)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          },
        }}
      >
        Durdur
      </Button>
    );
  }

  return (
    <Button
      size="xs"
      variant="filled"
      radius={0}
      leftSection={<IconPlayerPlay size={14} />}
      onClick={onStart}
      disabled={disabled}
      styles={{
        root: {
          background: "var(--lux-gold)",
          color: "#0d1b2a",
          borderColor: "var(--lux-gold)",
          fontFamily: "var(--lux-font-sans)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          fontWeight: 800,
        },
      }}
    >
      Oteli Gezdir
    </Button>
  );
}

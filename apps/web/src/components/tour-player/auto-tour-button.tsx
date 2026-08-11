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
        radius={999}
        leftSection={<IconPlayerStop size={14} />}
        onClick={onStop}
        disabled={disabled}
        styles={{
          root: {
            borderColor: "var(--er-line-strong)",
            color: "var(--er-primary)",
            background: "var(--er-surface)",
            fontFamily: "var(--er-font-sans)",
            fontWeight: 600,
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
      radius={999}
      leftSection={<IconPlayerPlay size={14} />}
      onClick={onStart}
      disabled={disabled}
      styles={{
        root: {
          background: "var(--er-primary)",
          color: "#fff",
          borderColor: "var(--er-primary)",
          fontFamily: "var(--er-font-sans)",
          fontWeight: 600,
        },
      }}
    >
      Oteli Gezdir
    </Button>
  );
}

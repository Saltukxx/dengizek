"use client";

import { Button, Group } from "@mantine/core";

interface TourGuideChipsProps {
  chips: string[];
  onChipClick: (chip: string) => void;
  disabled?: boolean;
}

export function TourGuideChips({ chips, onChipClick, disabled }: TourGuideChipsProps) {
  if (!chips.length) return null;

  return (
    <Group gap={6} wrap="wrap" style={{ paddingInline: 4 }}>
      {chips.map((chip) => (
        <Button
          key={chip}
          size="xs"
          variant="outline"
          radius={0}
          disabled={disabled}
          onClick={() => onChipClick(chip)}
          styles={{
            root: {
              color: "var(--lux-muted)",
              borderColor: "rgba(212,175,55,0.32)",
              background: "rgba(212,175,55,0.04)",
              fontFamily: "var(--lux-font-sans)",
              fontWeight: 800,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            },
          }}
        >
          {chip}
        </Button>
      ))}
    </Group>
  );
}

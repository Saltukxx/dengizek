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
          radius={999}
          disabled={disabled}
          onClick={() => onChipClick(chip)}
          styles={{
            root: {
              color: "var(--er-primary)",
              borderColor: "var(--er-line-strong)",
              background: "var(--er-surface)",
              fontFamily: "var(--er-font-sans)",
              fontWeight: 600,
            },
          }}
        >
          {chip}
        </Button>
      ))}
    </Group>
  );
}

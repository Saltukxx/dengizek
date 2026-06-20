"use client";

import { Badge, Box, Button, Group, Paper, ScrollArea, Stack, Text, Title } from "@mantine/core";
import type { TourStep } from "@/lib/schemas/tour-manifest";

const kindLabelTr: Record<TourStep["kind"], string> = {
  lobby: "Lobi",
  corridor: "Koridor",
  room: "Oda",
  amenity_spot: "Olanak noktası",
};

const glassPanel = {
  background: "color-mix(in srgb, var(--mantine-color-body) 92%, transparent)",
  backdropFilter: "blur(10px) saturate(1.2)",
  border: "1px solid color-mix(in srgb, var(--mantine-color-brand-3) 35%, #fff 65%)",
  boxShadow: "0 8px 32px rgba(26, 24, 21, 0.18), 0 0 0 1px rgba(255, 255, 255, 0.4) inset",
} as const;

const darkPanel = {
  background: "rgba(22, 20, 18, 0.82)",
  backdropFilter: "blur(12px) saturate(1.1)",
  border: "1px solid rgba(255, 255, 255, 0.14)",
  boxShadow: "0 20px 48px rgba(0, 0, 0, 0.45)",
} as const;

type TourVideoPlayingInfoProps = {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  transition: string;
  hidden: boolean;
};

/**
 * Oynatma / yükleme sırasında video üzerinde sol üstte bilgi kartı.
 */
export function TourVideoPlayingInfo({
  step,
  stepIndex,
  totalSteps,
  transition,
  hidden,
}: TourVideoPlayingInfoProps) {
  if (hidden) return null;

  return (
    <Box
      pos="absolute"
      top={{ base: 8, sm: 16 }}
      left={{ base: 8, sm: 16 }}
      right={{ base: 8, sm: "auto" }}
      w={{ base: "auto", sm: 400 }}
      maw={{ base: "100%", sm: 400 }}
      style={{
        zIndex: 2,
        transition,
        pointerEvents: "none",
        maxWidth: "min(100%, 420px)",
      }}
    >
      <Paper
        p={{ base: "sm", sm: "md" }}
        radius="md"
        style={glassPanel}
      >
        <Group gap="xs" mb="xs" wrap="wrap">
          <Badge size="sm" color="brand" variant="filled" radius="sm">
            Adım {stepIndex + 1} / {totalSteps}
          </Badge>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {kindLabelTr[step.kind]}
          </Text>
        </Group>
        <Title order={4} size="h4" lineClamp={2} mb={step.body ? 4 : 0}>
          {step.title}
        </Title>
        {step.body && (
          <ScrollArea h={100} type="auto" scrollbars="y">
            <Text size="sm" c="dimmed" style={{ lineHeight: 1.5 }}>
              {step.body}
            </Text>
          </ScrollArea>
        )}
      </Paper>
    </Box>
  );
}

type TourVideoInteractionInfoProps = {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  transition: string;
  continueLabel: string;
  onContinue: () => void;
  onSelectBranch?: (nextStepId: string) => void;
};

/**
 * Kullanıcı onayı beklenen adımlarda video üzerinde ortalanmış net bilgi kutusu.
 */
export function TourVideoInteractionInfo({
  step,
  stepIndex,
  totalSteps,
  transition,
  continueLabel,
  onContinue,
  onSelectBranch,
}: TourVideoInteractionInfoProps) {
  return (
    <Box
      pos="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--mantine-spacing-md)",
        background: "rgba(10, 8, 7, 0.58)",
        transition,
        zIndex: 3,
        pointerEvents: "auto",
      }}
    >
      <Paper
        p={{ base: "md", sm: "lg" }}
        maw={460}
        w="100%"
        radius="lg"
        style={darkPanel}
      >
        <Stack gap="md">
          <div>
            <Group gap="xs" mb="sm">
              <Badge size="md" color="brand" variant="light" radius="sm">
                Adım {stepIndex + 1} / {totalSteps}
              </Badge>
              <Text size="xs" c="gray.3" tt="uppercase" fw={600}>
                {kindLabelTr[step.kind]}
              </Text>
            </Group>
            <Title order={3} c="white">
              {step.title}
            </Title>
          </div>
          {step.body && (
            <Text size="sm" c="gray.2" style={{ lineHeight: 1.6 }}>
              {step.body}
            </Text>
          )}
          {step.branches && step.branches.length > 0 && onSelectBranch ? (
            <Stack gap="sm">
              {step.branches.map((b) => (
                <Button
                  key={b.id}
                  data-testid={`tour-branch-${b.id}`}
                  size="md"
                  fullWidth
                  color="brand"
                  variant="filled"
                  onClick={() => onSelectBranch(b.nextStepId)}
                >
                  {b.label}
                </Button>
              ))}
            </Stack>
          ) : (
            <Button
              onClick={onContinue}
              data-testid="tour-continue"
              size="md"
              fullWidth
              color="brand"
              variant="filled"
            >
              {continueLabel}
            </Button>
          )}
        </Stack>
      </Paper>
    </Box>
  );
}

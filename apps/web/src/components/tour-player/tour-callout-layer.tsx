"use client";

import { Box, Paper, Text } from "@mantine/core";
import type { TourCallout, TourCalloutPlacement } from "@/lib/schemas/tour-manifest";
import {
  DEFAULT_CALLOUT_PLACEMENT,
  getActiveCallout,
  getVisibleCallouts,
} from "@/lib/tour/tour-active-callout";
import type { CSSProperties } from "react";

const glass = {
  background: "color-mix(in srgb, var(--mantine-color-body) 90%, transparent)",
  backdropFilter: "blur(8px)",
  border: "1px solid color-mix(in srgb, var(--mantine-color-brand-2) 40%, #fff 60%)",
} as const;

const pad = 16;
/** Seek / kontrol çubuğunun üstü */
const controlClearance = 100;

function calloutBoxStyle(
  placement: TourCalloutPlacement,
  stackIndex: number,
): CSSProperties {
  const yStack = stackIndex * 12;
  const base: CSSProperties = {
    zIndex: 3,
    pointerEvents: "none",
    position: "absolute",
  };
  switch (placement) {
    case "topStart":
      return { ...base, top: pad + yStack, left: pad, right: "auto", bottom: "auto" };
    case "topEnd":
      return { ...base, top: pad + yStack, right: pad, left: "auto", bottom: "auto" };
    case "bottomStart":
      return {
        ...base,
        bottom: controlClearance + yStack,
        left: pad,
        right: "auto",
        top: "auto",
      };
    case "bottomEnd":
      return {
        ...base,
        bottom: controlClearance + yStack,
        right: pad,
        left: "auto",
        top: "auto",
      };
    case "center":
      return {
        ...base,
        top: "50%",
        left: "50%",
        right: "auto",
        bottom: "auto",
        transform: `translate(calc(-50%), calc(-50% + ${yStack}px))`,
      };
  }
}

type TourCalloutLayerProps = {
  callouts: TourCallout[] | undefined;
  currentTimeSec: number;
  /** Etkileşim tam ekran açıkken gizle */
  hidden: boolean;
  /** Açıksa: başlamış tüm callout'lar, placement ile köşe/orta */
  isFullscreen: boolean;
};

function CalloutPaper({ c }: { c: TourCallout }) {
  return (
    <Paper p="sm" radius="md" maw={360} style={glass}>
      <Text size="sm" fw={600}>
        {c.title}
      </Text>
      {c.body ? (
        <Text size="xs" c="dimmed" mt={4}>
          {c.body}
        </Text>
      ) : null}
    </Paper>
  );
}

export function TourCalloutLayer({
  callouts,
  currentTimeSec,
  hidden,
  isFullscreen,
}: TourCalloutLayerProps) {
  if (hidden) return null;

  if (isFullscreen) {
    const visible = getVisibleCallouts(callouts, currentTimeSec);
    if (visible.length === 0) return null;
    return (
      <>
        {visible.map((c, i) => {
          const p = c.placement ?? DEFAULT_CALLOUT_PLACEMENT;
          const sameBefore = visible
            .slice(0, i)
            .filter((x) => (x.placement ?? DEFAULT_CALLOUT_PLACEMENT) === p)
            .length;
          return (
            <Box key={c.id} style={calloutBoxStyle(p, sameBefore)}>
              <CalloutPaper c={c} />
            </Box>
          );
        })}
      </>
    );
  }

  const c = getActiveCallout(callouts, currentTimeSec);
  if (!c) return null;
  return (
    <Box
      pos="absolute"
      left={16}
      right={16}
      bottom={108}
      style={{ zIndex: 3, pointerEvents: "none" }}
    >
      <Paper p="sm" radius="md" maw={480} style={glass}>
        <Text size="sm" fw={600}>
          {c.title}
        </Text>
        {c.body ? (
          <Text size="xs" c="dimmed" mt={4}>
            {c.body}
          </Text>
        ) : null}
      </Paper>
    </Box>
  );
}

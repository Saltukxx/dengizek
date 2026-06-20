"use client";

import { ActionIcon, Box, Popover, Text } from "@mantine/core";
import { IconMapPin } from "@tabler/icons-react";
import { useLayoutEffect, useMemo, useState, type RefObject } from "react";
import type { TourHotspot } from "@/lib/schemas/tour-manifest";
import { getVideoContentRect, hotspotPctToStylePosition } from "@/lib/tour/tour-video-bounds";

type TourHotspotLayerProps = {
  containerRef: RefObject<HTMLDivElement | null>;
  videoRef: RefObject<HTMLVideoElement | null>;
  stepId: string;
  hotspots: TourHotspot[] | undefined;
  currentTimeSec: number;
  /** Etkileşim tam ekran / devre dışı */
  disabled?: boolean;
};

function isHotspotVisible(h: TourHotspot, t: number) {
  if (h.tSec == null) return true;
  return t + 0.02 >= h.tSec;
}

export function TourHotspotLayer({
  containerRef,
  videoRef,
  stepId,
  hotspots,
  currentTimeSec,
  disabled,
}: TourHotspotLayerProps) {
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [videoSize, setVideoSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const sync = () => {
      setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    };
    sync();
    const ro = new ResizeObserver(() => sync());
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef, stepId]);

  useLayoutEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const sync = () => {
      setVideoSize({ w: v.videoWidth, h: v.videoHeight });
    };
    v.addEventListener("loadedmetadata", sync);
    sync();
    return () => v.removeEventListener("loadedmetadata", sync);
  }, [videoRef, stepId, hotspots]);

  const contentRect = useMemo(() => {
    const cw = containerSize.w;
    const ch = containerSize.h;
    const vw = videoSize.w > 0 ? videoSize.w : cw;
    const vh = videoSize.h > 0 ? videoSize.h : ch;
    return getVideoContentRect(cw, ch, vw, vh);
  }, [containerSize.h, containerSize.w, videoSize.h, videoSize.w]);

  if (disabled || !hotspots?.length || containerSize.w <= 0) return null;

  return (
    <>
      {hotspots.map((h) => {
        if (!isHotspotVisible(h, currentTimeSec)) return null;
        const pos = hotspotPctToStylePosition(h.xPct, h.yPct, contentRect);
        return (
          <Box
            key={h.id}
            data-testid={`tour-hotspot-${h.id}`}
            style={{
              position: "absolute",
              left: pos.left,
              top: pos.top,
              transform: "translate(-50%, -100%)",
              zIndex: 2,
            }}
          >
            <Popover position="top" withArrow shadow="md" zIndex={6}>
              <Popover.Target>
                <ActionIcon
                  variant="filled"
                  color="brand"
                  radius="xl"
                  size="lg"
                  aria-label={h.label}
                >
                  <IconMapPin size={20} />
                </ActionIcon>
              </Popover.Target>
              <Popover.Dropdown>
                <Text size="sm" fw={600}>
                  {h.label}
                </Text>
                {h.body ? (
                  <Text size="xs" c="dimmed" mt={4}>
                    {h.body}
                  </Text>
                ) : null}
              </Popover.Dropdown>
            </Popover>
          </Box>
        );
      })}
    </>
  );
}

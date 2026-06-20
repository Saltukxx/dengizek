"use client";

import {
  ActionIcon,
  Box,
  Button,
  Group,
  Stack,
  Text,
  Title,
  VisuallyHidden,
} from "@mantine/core";
import { useFullscreen, useMediaQuery, useMergedRef, useReducedMotion } from "@mantine/hooks";
import {
  IconArrowLeft,
  IconMaximize,
  IconMinimize,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type SyntheticEvent,
} from "react";
import type { TourManifest } from "@/lib/schemas/tour-manifest";
import {
  clampTimeInWindow,
  getClipEndSec,
  getClipStartSec,
  isPastClipEnd,
} from "@/lib/tour/tour-clip-helpers";
import { useTourGuide } from "@/lib/tour/use-tour-guide";
import { TourCalloutLayer } from "./tour-callout-layer";
import { TourGuidePanel } from "./TourGuidePanel";
import { TourHeader } from "./TourHeader";
import { TourVideoControls } from "./TourVideoControls";
import { TourHotspotLayer } from "./tour-hotspot-layer";
import { TourVideoInteractionInfo } from "./tour-video-info-boxes";
import { useTourPlayerMachine } from "./use-tour-player-machine";

type TourPlayerProps = {
  manifest: TourManifest;
  backHref: string;
  backLabel?: string;
  onStepChange?: (index: number) => void;
  onComplete?: () => void;
};

export function TourPlayer({
  manifest,
  backHref,
  backLabel = "Otele dön",
  onStepChange,
  onComplete,
}: TourPlayerProps) {
  const reduceMotion = useReducedMotion();
  const isMobileGuide = useMediaQuery("(max-width: 48em)");
  const router = useRouter();
  const {
    videoRef,
    machine,
    sortedSteps,
    currentStep,
    setError,
    handleCanPlay,
    handleVideoEnded,
    continueFromPause,
    goToIndex,
    goToStepId,
  } = useTourPlayerMachine(manifest, {
    onStepChange: (i) => onStepChange?.(i),
    onComplete,
  });

  const [captionsOn, setCaptionsOn] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [playbackSec, setPlaybackSec] = useState(0);
  const [fileDuration, setFileDuration] = useState(0);
  const [stepsSeen, setStepsSeen] = useState<string[]>([]);

  // Görülen adımları takip et
  useEffect(() => {
    if (currentStep && !stepsSeen.includes(currentStep.stepId)) {
      setStepsSeen((prev) => [...prev, currentStep.stepId]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep?.stepId]);

  // Otel adı: hotelSlug'dan türet
  const hotelName = manifest.hotelSlug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  const {
    messages: guideMessages,
    isThinking: guideThinking,
    isAutoTour,
    sendMessage,
    handleChipClick,
    startAutoTour,
    stopAutoTour,
    notifyStepStart,
    notifyStepEnd,
  } = useTourGuide({
    manifest,
    currentStep,
    stepsSeen,
    onNavigate: goToStepId,
    onOpenInquiry: (roomSlug?: string, fromAi = false) => {
      const params = new URLSearchParams({
        hotel: manifest.hotelSlug,
        tour: manifest.tourId,
        source: fromAi ? "tour_ai" : "tour_player",
      });
      if (roomSlug) params.set("room", roomSlug);
      const step = currentStep?.stepId;
      if (step) params.set("step", step);
      router.push(`/inquiry?${params.toString()}`);
    },
  });
  const clipSequenceDoneRef = useRef(false);
  const notifiedStepStartRef = useRef<string | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const { ref: fullScreenRef, toggle: toggleFullscreen, fullscreen: isFullScreen } =
    useFullscreen<HTMLDivElement>();
  const videoAreaRef = useMergedRef(fullScreenRef, videoContainerRef);
  const stepIndex = machine.stepIndex;

  useEffect(() => {
    clipSequenceDoneRef.current = false;
  }, [currentStep?.stepId]);

  useEffect(() => {
    if (!sortedSteps[0]) return;
    onStepChange?.(0);
  }, [onStepChange, sortedSteps]);

  useEffect(() => {
    if (currentStep) {
      setAnnounce(
        `Adım ${stepIndex + 1} / ${sortedSteps.length}: ${currentStep.title}`,
      );
      if (notifiedStepStartRef.current !== currentStep.stepId) {
        notifiedStepStartRef.current = currentStep.stepId;
        notifyStepStart(currentStep.stepId);
      }
    }
  }, [currentStep, notifyStepStart, sortedSteps.length, stepIndex]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    for (let i = 0; i < v.textTracks.length; i += 1) {
      v.textTracks[i]!.mode = captionsOn ? "showing" : "hidden";
    }
  }, [captionsOn, currentStep, videoRef]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }, [videoRef]);

  const canStepBack = stepIndex > 0;
  const canStepForward = stepIndex < sortedSteps.length - 1;

  const goPreviousStep = useCallback(() => {
    if (!canStepBack) return;
    goToIndex(stepIndex - 1);
  }, [canStepBack, goToIndex, stepIndex]);

  const goNextStep = useCallback(() => {
    if (!canStepForward) return;
    goToIndex(stepIndex + 1);
  }, [canStepForward, goToIndex, stepIndex]);

  const markClipSequenceComplete = useCallback(() => {
    if (clipSequenceDoneRef.current) return;
    clipSequenceDoneRef.current = true;
    if (currentStep) notifyStepEnd(currentStep.stepId);
    handleVideoEnded();
  }, [currentStep, handleVideoEnded, notifyStepEnd]);

  const onVideoLoadedMetadata = useCallback(
    (e: SyntheticEvent<HTMLVideoElement>) => {
      const v = e.currentTarget;
      const d = v.duration || 0;
      setFileDuration(d);
      if (!currentStep) return;
      const start = getClipStartSec(currentStep.media);
      v.currentTime = start;
      setPlaybackSec(start);
    },
    [currentStep],
  );

  const onVideoTimeUpdate = useCallback(
    (e: SyntheticEvent<HTMLVideoElement>) => {
      const v = e.currentTarget;
      const d = v.duration || 0;
      if (d > 0) setFileDuration(d);
      setPlaybackSec(v.currentTime);
      if (!currentStep) return;
      const { media } = currentStep;
      const start = getClipStartSec(media);
      const end = getClipEndSec(media, d);
      if (v.currentTime < start) v.currentTime = start;
      if (d > 0 && v.currentTime > end) v.currentTime = end;
      if (clipSequenceDoneRef.current) return;
      if (media.endSec != null && d > 0 && isPastClipEnd(v.currentTime, end)) {
        v.pause();
        markClipSequenceComplete();
      }
    },
    [currentStep, markClipSequenceComplete],
  );

  const onVideoEnded = useCallback(() => {
    markClipSequenceComplete();
  }, [markClipSequenceComplete]);

  const onSeek = useCallback(
    (t: number) => {
      const v = videoRef.current;
      if (!v || !currentStep) return;
      const start = getClipStartSec(currentStep.media);
      const end = getClipEndSec(currentStep.media, v.duration);
      v.currentTime = clampTimeInWindow(t, start, end);
      setPlaybackSec(v.currentTime);
    },
    [currentStep, videoRef],
  );

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (
        e.target !== document.body &&
        (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT")
      )
        return;
      if (e.key === " " || e.code === "Space") {
        if (machine.phase === "playing" || (machine.phase === "loading" && videoRef.current)) {
          e.preventDefault();
          togglePlay();
        }
      }
      if (e.key === "Enter" && machine.phase === "pausedForInteraction") {
        e.preventDefault();
        continueFromPause();
      }
      if (e.key === "ArrowLeft" && canStepBack) {
        e.preventDefault();
        goPreviousStep();
      }
      if (e.key === "ArrowRight" && canStepForward) {
        e.preventDefault();
        goNextStep();
      }
    },
    [
      machine.phase,
      continueFromPause,
      togglePlay,
      videoRef,
      canStepBack,
      canStepForward,
      goNextStep,
      goPreviousStep,
    ],
  );

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  if (machine.phase === "error") {
    return (
      <Stack p="md">
        <Text c="red">Bir hata oluştu: {machine.errorMessage}</Text>
        <Button component={Link} href={backHref} variant="light">
          {backLabel}
        </Button>
      </Stack>
    );
  }

  if (!currentStep && machine.phase !== "ended") {
    return <Text>Yükleniyor…</Text>;
  }

  if (machine.phase === "ended") {
    return (
      <Stack p="md" align="center" gap="md">
        <Title order={2}>Tur tamamlandı</Title>
        <Text c="dimmed">Rehberli turu tamamladınız.</Text>
        <Button component={Link} href={backHref} size="md">
          {backLabel}
        </Button>
      </Stack>
    );
  }

  const transition = reduceMotion ? "none" : "opacity 0.2s ease";
  const clipMin = getClipStartSec(currentStep.media);
  const clipMax = getClipEndSec(currentStep.media, fileDuration);

  const videoShellStyle: CSSProperties = isFullScreen
    ? {
        width: "100%",
        height: "100%",
        maxHeight: "none",
        minHeight: 0,
        aspectRatio: "auto",
        borderRadius: 0,
        background: "var(--mantine-color-dark-9)",
        overflow: "hidden",
      }
    : {
        width: "100%",
        height: "100%",
        background: "var(--lux-bg)",
        borderRadius: 0,
        overflow: "hidden",
      };

  const guidePanel = (
    <TourGuidePanel
      messages={guideMessages}
      isThinking={guideThinking}
      isAutoTour={isAutoTour}
      hotelName={hotelName}
      onSendMessage={sendMessage}
      onChipClick={handleChipClick}
      onStartAutoTour={startAutoTour}
      onStopAutoTour={stopAutoTour}
    />
  );


  const videoSurface = (
    <Box ref={videoAreaRef} pos="relative" style={videoShellStyle} className="luxury-grain">
          <video
            key={currentStep.stepId}
            ref={videoRef}
            src={currentStep.media.src}
            playsInline
            onLoadedMetadata={onVideoLoadedMetadata}
            onTimeUpdate={onVideoTimeUpdate}
            onCanPlay={(e) => {
              handleCanPlay();
              void e.currentTarget.play().catch(() => {
                // autoplay can be blocked until a user gesture; controls still work
              });
            }}
            onEnded={onVideoEnded}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onError={() => setError("Video yüklenemedi veya oynatılamadı.")}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              filter: "saturate(1.05) contrast(1.04)",
            }}
            controls={false}
          >
            {currentStep.captionsVttUrl ? (
              <track
                key={currentStep.captionsVttUrl + captionsOn}
                kind="captions"
                srcLang="tr"
                label="Türkçe"
                src={currentStep.captionsVttUrl}
                default={captionsOn}
              />
            ) : null}
          </video>

          <TourCalloutLayer
            callouts={currentStep.callouts}
            currentTimeSec={playbackSec}
            hidden={machine.phase === "pausedForInteraction"}
            isFullscreen={isFullScreen}
          />
          <TourHotspotLayer
            containerRef={videoContainerRef}
            videoRef={videoRef}
            stepId={currentStep.stepId}
            hotspots={currentStep.hotspots}
            currentTimeSec={playbackSec}
            disabled={machine.phase === "pausedForInteraction"}
          />

          {machine.phase === "pausedForInteraction" && (
            <TourVideoInteractionInfo
              step={currentStep}
              stepIndex={stepIndex}
              totalSteps={sortedSteps.length}
              transition={transition}
              continueLabel={
                machine.stepIndex >= sortedSteps.length - 1 ? "Bitir" : "Devam et"
              }
              onContinue={continueFromPause}
              onSelectBranch={goToStepId}
            />
          )}

          <Box
            pos="absolute"
            top={0}
            left={0}
            right={0}
            bottom={0}
            style={{
              pointerEvents: "none",
              zIndex: 2,
              background:
                "linear-gradient(to top, rgba(8,9,10,0.86) 0%, transparent 46%, rgba(8,9,10,0.18) 100%)",
            }}
          />

          <Box
            pos="absolute"
            top={{ base: 116, md: 72 }}
            left={{ base: 24, md: 64 }}
            style={{ zIndex: 3, pointerEvents: "none" }}
          >
            <Text className="luxury-label" style={{ color: "rgba(212,175,55,0.72)" }}>
              {String(stepIndex + 1).padStart(2, "0")} / {currentStep.kind === "lobby" ? "Lobi Sahnesi" : currentStep.title}
            </Text>
          </Box>

          <Box
            pos="absolute"
            left={{ base: 24, md: 64 }}
            bottom={{ base: isMobileGuide ? 420 : 110, md: 116 }}
            maw={{ base: "calc(100% - 48px)", md: 660 }}
            style={{ zIndex: 3, pointerEvents: "none" }}
          >
            <Title
              className="luxury-editorial-title"
              style={{
                color: "var(--lux-text)",
                fontSize: "clamp(54px, 7vw, 92px)",
                lineHeight: 1.04,
                textShadow: "0 3px 20px rgba(0,0,0,0.58)",
              }}
            >
              {currentStep.title}
            </Title>
            {currentStep.body && (
              <Text
                mt={20}
                style={{
                  color: "var(--lux-muted)",
                  fontFamily: "var(--lux-font-sans)",
                  fontSize: "clamp(17px, 2vw, 24px)",
                  lineHeight: 1.55,
                  maxWidth: 560,
                }}
              >
                {currentStep.body}
              </Text>
            )}
            <button
              type="button"
              onClick={isAutoTour ? stopAutoTour : startAutoTour}
              className="luxury-label"
              style={{
                pointerEvents: "auto",
                marginTop: 34,
                padding: "0 0 7px",
                color: "var(--lux-gold)",
                background: "transparent",
                border: 0,
                borderBottom: "1px solid rgba(212,175,55,0.75)",
                cursor: "pointer",
              }}
            >
              {isAutoTour ? "Turu Durdur" : "Tur Başlat"}
            </button>
          </Box>

          <TourVideoControls
            playbackSec={playbackSec}
            clipMin={clipMin}
            clipMax={clipMax}
            fileDuration={fileDuration}
            isPlaying={isPlaying}
            isFullScreen={isFullScreen}
            captionsOn={captionsOn}
            captionsAvailable={!!currentStep.captionsVttUrl}
            stepIndex={stepIndex}
            totalSteps={sortedSteps.length}
            backHref={backHref}
            backLabel={backLabel}
            reduceMotion={!!reduceMotion}
            isPausedForInteraction={machine.phase === "pausedForInteraction"}
            onSeek={onSeek}
            onTogglePlay={togglePlay}
            onToggleCaptions={() => setCaptionsOn((c) => !c)}
            onToggleFullscreen={() => void toggleFullscreen()}
          />
        </Box>
  );

  if (isMobileGuide) {
    return (
      <Box className="luxury-full-bleed" style={{ height: "100dvh", overflow: "hidden", position: "relative" }}>
        <VisuallyHidden component="p" role="status" aria-live="polite">
          {announce}
        </VisuallyHidden>
        <Box
          pos="absolute"
          top={28}
          left={32}
          right={32}
          style={{ zIndex: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <ActionIcon
            component={Link}
            href={backHref}
            size={72}
            radius="50%"
            variant="transparent"
            aria-label={backLabel}
            style={{ border: "1px solid rgba(212,175,55,0.38)", color: "var(--lux-gold)" }}
          >
            <IconArrowLeft size={34} />
          </ActionIcon>
          <div style={{ textAlign: "center" }}>
            <Text className="luxury-label" style={{ fontSize: 24, color: "var(--lux-gold)" }}>
              {hotelName}
            </Text>
            <Text className="luxury-label" mt={12} style={{ color: "var(--lux-muted)", fontSize: 18 }}>
              {currentStep?.title ?? ""}
            </Text>
          </div>
          <ActionIcon
            size={72}
            radius="50%"
            variant="transparent"
            aria-label={isFullScreen ? "Tam ekrandan çık" : "Tam ekran"}
            onClick={() => void toggleFullscreen()}
            style={{ border: "1px solid rgba(212,175,55,0.38)", color: "var(--lux-gold)" }}
          >
            {isFullScreen ? <IconMinimize size={30} /> : <IconMaximize size={30} />}
          </ActionIcon>
        </Box>
        <Box pos="absolute" inset={0}>
          {videoSurface}
        </Box>
        <Box
          pos="absolute"
          left={0}
          right={0}
          bottom={0}
          h="58dvh"
          style={{
            zIndex: 16,
            borderTop: "1px solid rgba(212,175,55,0.38)",
            borderRadius: "18px 18px 0 0",
            overflow: "hidden",
            background: "rgba(18,20,20,0.94)",
          }}
        >
          {guidePanel}
        </Box>
      </Box>
    );
  }

  return (
    <Box className="luxury-full-bleed" style={{ height: "100dvh", overflow: "hidden", position: "relative" }}>
      <VisuallyHidden component="p" role="status" aria-live="polite">
        {announce}
      </VisuallyHidden>
      <TourHeader
        hotelName={hotelName}
        hotelSlug={manifest.hotelSlug}
        backHref={backHref}
      />

      <Group
        align="stretch"
        wrap="nowrap"
        gap="md"
        style={{
          position: "fixed",
          top: 96,
          left: 0,
          right: 0,
          bottom: 0,
          padding: 16,
        }}
      >
        <Box style={{ flex: 1, minWidth: 0, overflow: "hidden", position: "relative" }}>
          {videoSurface}
        </Box>
        <Box
          style={{
            flex: "0 0 400px",
            overflow: "hidden",
            zIndex: 44,
            borderRadius: 6,
            border: "0.5px solid rgba(212,175,55,0.22)",
            boxShadow: "0 8px 48px rgba(0,0,0,0.55)",
          }}
        >
          {guidePanel}
        </Box>
      </Group>
    </Box>
  );
}

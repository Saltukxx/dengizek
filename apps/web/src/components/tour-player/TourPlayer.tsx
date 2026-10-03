"use client";

import {
  ActionIcon,
  Box,
  Button,
  Group,
  Loader,
  Stack,
  Text,
  Title,
  UnstyledButton,
  VisuallyHidden,
} from "@mantine/core";
import { useFullscreen, useMediaQuery, useMergedRef, useReducedMotion } from "@mantine/hooks";
import {
  IconArrowLeft,
  IconChevronDown,
  IconChevronUp,
  IconMaximize,
  IconMessageCircle,
  IconMinimize,
  IconPlayerPlayFilled,
  IconRefresh,
  IconSparkles,
  IconVolume,
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
import { computeCompletionState } from "@/lib/ai/completion-engine";
import { trackEvent } from "@/lib/analytics-client";
import { useTourGuide } from "@/lib/tour/use-tour-guide";
import { useGuestSession } from "@/lib/tour/use-guest-session";
import { TourCalloutLayer } from "./tour-callout-layer";
import { TourGuidePanel } from "./TourGuidePanel";
import { TourHeader } from "./TourHeader";
import { TourVideoControls } from "./TourVideoControls";
import { TourHotspotLayer } from "./tour-hotspot-layer";
import { TourVideoInteractionInfo } from "./tour-video-info-boxes";
import { useTourPlayerMachine } from "./use-tour-player-machine";
import { useVideoSource } from "./use-video-source";
import { usePlaybackToken } from "./use-playback-token";

// Kapalı mobil çekmece yüksekliği — panel header'ı + metin girişi görünür kalır.
const GUIDE_PEEK_HEIGHT = 210;

type TourPlayerProps = {
  manifest: TourManifest;
  hotelName?: string;
  surface?: "yaz" | "kis";
  /** ?room= bağlamı — AI oda belirtmediğinde talep formu bununla doldurulur. */
  contextRoomSlug?: string;
  backHref: string;
  backLabel?: string;
  onStepChange?: (index: number) => void;
  onComplete?: () => void;
};

export function TourPlayer({
  manifest,
  hotelName,
  surface = "yaz",
  contextRoomSlug,
  backHref,
  backLabel = "Otele dön",
  onStepChange,
  onComplete,
}: TourPlayerProps) {
  const reduceMotion = useReducedMotion();
  const isMobileGuide = useMediaQuery("(max-width: 48em)");
  const router = useRouter();
  const isWinter = surface === "kis";
  const inquiryPath = isWinter ? "/kis/talep" : "/inquiry";
  const guidePeekHeight = isWinter ? 112 : GUIDE_PEEK_HEIGHT;
  const rootClassName = `er-tour-page${isWinter ? " er-tour-winter" : ""}`;
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
  // Otomatik oynatma politikası: engellenirse önce sessiz dene, o da olmazsa
  // dokun-oynat katmanı göster.
  const [startedMuted, setStartedMuted] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  // Mobil rehber çekmecesi: kapalıyken peek bar (header + input), açıkken 58dvh.
  const [guideExpanded, setGuideExpanded] = useState(false);

  // İmzalı medya URL'leri süresi dolmadan yenilenir; adım kimliği değişmediği
  // için oynatma pozisyonu korunur (bkz. use-video-source resumeTimeRef).
  const { resolveSrc: resolvePlaybackSrc } = usePlaybackToken(manifest);

  const { retry: retryVideoSource, usingHls } = useVideoSource({
    src: currentStep
      ? resolvePlaybackSrc(currentStep.stepId, currentStep.media.src)
      : "",
    stepId: currentStep?.stepId ?? "",
    videoRef,
    onFatalError: setError,
  });
  const tourCompleteTrackedRef = useRef(false);
  const trackedStepViewsRef = useRef(new Set<string>());
  const { resumeAvailable, persistProgress, dismissResume } = useGuestSession(
    manifest.hotelSlug,
    manifest.tourId,
  );

  const visibleStepList = manifest.steps
    .filter((s) => s.aiVisible !== false)
    .sort((a, b) => a.order - b.order);

  useEffect(() => {
    if (currentStep && !stepsSeen.includes(currentStep.stepId)) {
      setStepsSeen((prev) => [...prev, currentStep.stepId]);
    }
  }, [currentStep, stepsSeen]);

  useEffect(() => {
    if (stepsSeen.length === 0) return;
    persistProgress(stepsSeen, currentStep?.stepId ?? null);
  }, [stepsSeen, currentStep, persistProgress]);

  const acceptResume = useCallback(() => {
    if (!resumeAvailable) return;
    setStepsSeen(resumeAvailable.stepsSeen);
    if (resumeAvailable.lastStepId) goToStepId(resumeAvailable.lastStepId);
    dismissResume();
  }, [resumeAvailable, dismissResume, goToStepId]);

  // Gerçek ad route'tan gelir; bağımsız kullanımda slug okunur bir ada çevrilir.
  const resolvedHotelName =
    hotelName?.trim() ||
    manifest.hotelSlug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

  const {
    messages: guideMessages,
    isThinking: guideThinking,
    isAutoTour,
    detectedLanguage,
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
      // AI bir oda belirtmediyse, tura hangi odadan gelindiyse o kullanılır.
      const inquiryRoom = roomSlug ?? contextRoomSlug;
      if (inquiryRoom) params.set("room", inquiryRoom);
      const step = currentStep?.stepId;
      if (step) params.set("step", step);
      router.push(`${inquiryPath}?${params.toString()}`);
    },
  });

  useEffect(() => {
    if (!currentStep || trackedStepViewsRef.current.has(currentStep.stepId)) return;
    if (!stepsSeen.includes(currentStep.stepId)) return;

    trackedStepViewsRef.current.add(currentStep.stepId);
    const completion = computeCompletionState(
      visibleStepList.map((s) => ({ stepId: s.stepId, title: s.title })),
      stepsSeen,
      currentStep.stepId,
    );

    void trackEvent(
      "tour_step_view",
      {
        tourId: manifest.tourId,
        stepId: currentStep.stepId,
        stepsSeenCount: completion.seenCount,
        totalSteps: completion.totalCount,
        progressRatio: completion.progressRatio,
        isAutoTour,
      },
      manifest.hotelSlug,
    );

    if (completion.isComplete && !tourCompleteTrackedRef.current) {
      tourCompleteTrackedRef.current = true;
      void trackEvent(
        "tour_complete",
        {
          tourId: manifest.tourId,
          stepsSeenCount: completion.seenCount,
          totalSteps: completion.totalCount,
          progressRatio: 1,
          isAutoTour,
        },
        manifest.hotelSlug,
      );
    }
  }, [currentStep, isAutoTour, manifest.hotelSlug, manifest.tourId, stepsSeen, visibleStepList]);

  const clipSequenceDoneRef = useRef(false);
  const notifiedStepStartRef = useRef<string | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const { ref: fullScreenRef, toggle: toggleFullscreen, fullscreen: isFullScreen } =
    useFullscreen<HTMLDivElement>();
  const videoAreaRef = useMergedRef(fullScreenRef, videoContainerRef);
  const stepIndex = machine.stepIndex;

  useEffect(() => {
    clipSequenceDoneRef.current = false;
    setAutoplayBlocked(false);
    setIsBuffering(false);
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

  const attemptAutoplay = useCallback(
    async (video: HTMLVideoElement) => {
      // Kullanıcı önceki adımda sessiz başlatmayı kabul ettiyse (video elementi
      // her adımda remount olduğundan) muted durumunu yeniden uygula.
      if (startedMuted) video.muted = true;
      try {
        await video.play();
        setAutoplayBlocked(false);
      } catch {
        // Otomatik oynatma engellendi — bir kez sessiz dene.
        video.muted = true;
        try {
          await video.play();
          setStartedMuted(true);
          setAutoplayBlocked(false);
        } catch {
          // Sessiz oynatma da engellendi — dokun-oynat katmanı göster.
          setAutoplayBlocked(true);
        }
      }
    },
    [startedMuted],
  );

  const unmute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    setStartedMuted(false);
  }, [videoRef]);

  const tapToPlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setAutoplayBlocked(false);
    void v.play().catch(() => {
      setAutoplayBlocked(true);
    });
  }, [videoRef]);

  const retryPlayback = useCallback(() => {
    setIsBuffering(false);
    retryVideoSource();
  }, [retryVideoSource]);

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
        (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON")
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
        if (currentStep?.branches?.length) {
          // Dallı adımda Enter seçimi atlamamalı — ilk dal seçeneğine odaklan,
          // kullanıcı ok/Tab + Enter ile seçsin.
          const firstBranch = videoContainerRef.current?.querySelector<HTMLButtonElement>(
            '[data-testid^="tour-branch-"]',
          );
          firstBranch?.focus();
          return;
        }
        continueFromPause();
      }
      if (e.key === "ArrowLeft" && canStepBack && machine.phase !== "pausedForInteraction") {
        e.preventDefault();
        goPreviousStep();
      }
      if (e.key === "ArrowRight" && canStepForward && machine.phase !== "pausedForInteraction") {
        e.preventDefault();
        goNextStep();
      }
    },
    [
      machine.phase,
      continueFromPause,
      currentStep,
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
      <Box
        className={rootClassName}
        style={{
          height: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--er-bg)",
        }}
      >
        <Stack p="md" align="center" gap="md" maw={420}>
          <Text c="red" ta="center">
            Bir hata oluştu: {machine.errorMessage}
          </Text>
          <Group gap="sm">
            <Button
              leftSection={<IconRefresh size={18} />}
              onClick={() => {
                // Aynı adımı yeniden yükle ve video kaynağını sıfırdan bağla.
                goToIndex(machine.stepIndex);
                retryPlayback();
              }}
            >
              Tekrar dene
            </Button>
            <Button component={Link} href={backHref} variant="light">
              {backLabel}
            </Button>
          </Group>
        </Stack>
      </Box>
    );
  }

  if (!currentStep && machine.phase !== "ended") {
    return <Text>Yükleniyor…</Text>;
  }

  if (machine.phase === "ended") {
    return (
      <Box
        className={rootClassName}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      >
        <div className="er-panel" style={{ padding: 32, maxWidth: 480, textAlign: "center" }}>
          <Title order={2} className="er-display er-h2">
            Tur tamamlandı
          </Title>
          <Text mt={10} style={{ color: "var(--er-text-muted)" }}>
            Rehberli turu tamamladınız. Beğendiyseniz tesise bir talep bırakın.
          </Text>
          <Group justify="center" gap="sm" mt={24}>
            <Link href={`${inquiryPath}?hotel=${manifest.hotelSlug}`} className="er-btn er-btn-cta">
              Rezervasyon Talebi
            </Link>
            <Link href={backHref} className="er-btn er-btn-ghost">
              {backLabel}
            </Link>
          </Group>
        </div>
      </Box>
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
        background: "var(--er-navy)",
        borderRadius: "var(--er-radius-md)",
        overflow: "hidden",
      };

  const guidePanel = (
    <TourGuidePanel
      messages={guideMessages}
      isThinking={guideThinking}
      isAutoTour={isAutoTour}
      hotelName={resolvedHotelName}
      personaName={manifest.hotelProfile?.aiPersona}
      detectedLanguage={detectedLanguage}
      onSendMessage={sendMessage}
      onChipClick={handleChipClick}
      onStartAutoTour={startAutoTour}
      onStopAutoTour={stopAutoTour}
    />
  );

  const resumeBanner = resumeAvailable && (
    <Box
      className="er-tour-resume"
      pos="absolute"
      top={isMobileGuide ? 110 : 88}
      left="50%"
      style={{
        transform: "translateX(-50%)",
        zIndex: 30,
        background: "rgba(255,255,255,0.96)",
        border: "1px solid var(--er-line)",
        borderRadius: 999,
        padding: "10px 18px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        boxShadow: "var(--er-shadow)",
        backdropFilter: "blur(12px)",
      }}
    >
      <Text size="sm" style={{ color: "var(--er-text)" }}>
        Kaldığınız yerden devam edin mi?
      </Text>
      <Group gap={8}>
        <Button size="xs" onClick={acceptResume}>
          Devam et
        </Button>
        <Button size="xs" variant="subtle" color="gray" onClick={dismissResume}>
          Baştan başla
        </Button>
      </Group>
    </Box>
  );


  const videoSurface = (
    <Box ref={videoAreaRef} pos="relative" style={videoShellStyle} className="er-tour-stage">
          <video
            key={currentStep.stepId}
            ref={videoRef}
            playsInline
            onLoadedMetadata={onVideoLoadedMetadata}
            onTimeUpdate={onVideoTimeUpdate}
            onCanPlay={(e) => {
              setIsBuffering(false);
              handleCanPlay();
              void attemptAutoplay(e.currentTarget);
            }}
            onEnded={onVideoEnded}
            onPlay={() => setIsPlaying(true)}
            onPlaying={() => setIsBuffering(false)}
            onPause={() => setIsPlaying(false)}
            onWaiting={() => setIsBuffering(true)}
            onStalled={() => setIsBuffering(true)}
            onError={() => {
              // hls.js aktifken kurtarma stratejisi hook içinde yürütülür;
              // native yolda element hatası doğrudan fataldir.
              if (!usingHls) setError("Video yüklenemedi veya oynatılamadı.");
            }}
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

          {isBuffering && !autoplayBlocked && machine.phase === "playing" && (
            <Box
              pos="absolute"
              inset={0}
              style={{
                zIndex: 5,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
                background: "rgba(8,9,10,0.25)",
              }}
            >
              <Loader color="#fff" size="lg" />
            </Box>
          )}

          {autoplayBlocked && (
            <UnstyledButton
              onClick={tapToPlay}
              aria-label="Videoyu oynat"
              pos="absolute"
              style={{
                inset: 0,
                zIndex: 6,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 14,
                background: "rgba(8,9,10,0.55)",
              }}
            >
              <Box
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: "50%",
                  border: "1px solid var(--er-line)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(18,20,20,0.72)",
                }}
              >
                <IconPlayerPlayFilled size={40} style={{ color: "#fff" }} />
              </Box>
              <Text className="er-eyebrow" style={{ color: "#fff" }}>
                Oynatmak için dokunun
              </Text>
            </UnstyledButton>
          )}

          {startedMuted && !autoplayBlocked && (
            <Button
              onClick={unmute}
              leftSection={<IconVolume size={18} />}
              size="sm"
              variant="filled"
              color="dark"
              pos="absolute"
              top={isMobileGuide ? 116 : 24}
              right={24}
              style={{
                zIndex: 6,
                border: "1px solid var(--er-line)",
                color: "#fff",
                background: "rgba(18,20,20,0.85)",
              }}
            >
              Sesi aç
            </Button>
          )}

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
            <span className="er-tour-step-pill">
              Adım {stepIndex + 1} / {sortedSteps.length} —{" "}
              {currentStep.kind === "lobby" ? "Lobi Sahnesi" : currentStep.title}
              <span className="er-tour-dots" aria-hidden>
                {sortedSteps.map((s, i) => (
                  <span key={s.stepId} data-active={i === stepIndex} />
                ))}
              </span>
            </span>
          </Box>

          <Box
            pos="absolute"
            left={{ base: 24, md: 64 }}
            bottom={{
              base: isMobileGuide ? (guideExpanded ? 420 : guidePeekHeight + 110) : 110,
              md: 116,
            }}
            maw={{ base: "calc(100% - 48px)", md: 660 }}
            style={{ zIndex: 3, pointerEvents: "none" }}
          >
            <Title
              className="er-display"
              style={{
                color: "#fff",
                fontSize: "clamp(28px, 4vw, 48px)",
                lineHeight: 1.1,
                textShadow: "0 3px 20px rgba(14,31,64,0.55)",
              }}
            >
              {currentStep.title}
            </Title>
            {currentStep.body && (
              <Text
                mt={12}
                style={{
                  color: "rgba(255,255,255,0.9)",
                  fontFamily: "var(--er-font-sans)",
                  fontSize: "clamp(15px, 1.6vw, 18px)",
                  lineHeight: 1.6,
                  maxWidth: 520,
                  textShadow: "0 1px 12px rgba(14,31,64,0.5)",
                }}
              >
                {currentStep.body}
              </Text>
            )}
            <button
              type="button"
              onClick={isAutoTour ? stopAutoTour : startAutoTour}
              className="er-btn er-btn-cta"
              style={{ pointerEvents: "auto", marginTop: 20 }}
            >
              {isAutoTour ? "Turu Durdur" : "Otomatik Tur"}
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
            bottomOffset={
              isMobileGuide ? (guideExpanded ? "58dvh" : guidePeekHeight) : 0
            }
            onSeek={onSeek}
            onTogglePlay={togglePlay}
            onToggleCaptions={() => setCaptionsOn((c) => !c)}
            onToggleFullscreen={() => void toggleFullscreen()}
          />
        </Box>
  );

  if (isMobileGuide) {
    return (
      <Box className={rootClassName} style={{ height: "100dvh", overflow: "hidden", position: "relative" }}>
        <VisuallyHidden component="p" role="status" aria-live="polite">
          {announce}
        </VisuallyHidden>
        <Box
          pos="absolute"
          top={16}
          left={16}
          right={16}
          style={{ zIndex: 20, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}
        >
          <ActionIcon
            component={Link}
            href={backHref}
            size={44}
            radius="50%"
            variant="transparent"
            aria-label={backLabel}
            className="er-tour-round-btn"
          >
            <IconArrowLeft size={22} />
          </ActionIcon>
          <div style={{ textAlign: "center", minWidth: 0 }}>
            <Text
              fw={700}
              style={{ fontSize: 14, color: "#fff", textShadow: "0 1px 10px rgba(14,31,64,0.6)" }}
              lineClamp={1}
            >
              {resolvedHotelName}
            </Text>
            <Text
              style={{ fontSize: 12, color: "rgba(255,255,255,0.85)" }}
              mt={2}
              lineClamp={1}
            >
              {currentStep?.title ?? ""}
            </Text>
          </div>
          <ActionIcon
            size={44}
            radius="50%"
            variant="transparent"
            aria-label={isFullScreen ? "Tam ekrandan çık" : "Tam ekran"}
            onClick={() => void toggleFullscreen()}
            className="er-tour-round-btn"
          >
            {isFullScreen ? <IconMinimize size={20} /> : <IconMaximize size={20} />}
          </ActionIcon>
        </Box>
        <Box pos="absolute" inset={0}>
          {videoSurface}
        </Box>
        {resumeBanner}
        <Box
          pos="absolute"
          left={0}
          right={0}
          bottom={0}
          h={guideExpanded ? "58dvh" : guidePeekHeight}
          style={{
            zIndex: 16,
            borderTop: "1px solid var(--er-line)",
            borderRadius: "18px 18px 0 0",
            overflow: "hidden",
            background: "var(--er-surface)",
            boxShadow: "0 -8px 32px rgba(14,31,64,0.14)",
            transition: reduceMotion ? "none" : "height 0.25s ease",
          }}
        >
          <ActionIcon
            onClick={() => setGuideExpanded((e) => !e)}
            aria-label={guideExpanded ? "Rehberi küçült" : "Rehberi büyüt"}
            aria-expanded={guideExpanded}
            variant="transparent"
            size={44}
            pos="absolute"
            top={0}
            left="50%"
            style={{ zIndex: 2, color: "var(--er-text-dim)", transform: "translateX(-50%)" }}
          >
            {guideExpanded ? <IconChevronDown size={24} /> : <IconChevronUp size={24} />}
          </ActionIcon>
          {isWinter && !guideExpanded ? (
            <div className="er-winter-tour-mobile-actions">
              <button type="button" onClick={() => setGuideExpanded(true)}>
                <IconSparkles size={18} /> Rehbere Sor
              </button>
              <Link href={`${inquiryPath}?hotel=${manifest.hotelSlug}&tour=${manifest.tourId}&source=tour_player`}>
                <IconMessageCircle size={18} /> Talep Gönder
              </Link>
            </div>
          ) : (
            guidePanel
          )}
        </Box>
      </Box>
    );
  }

  return (
    <Box className={rootClassName} style={{ height: "100dvh", overflow: "hidden", position: "relative" }}>
      <VisuallyHidden component="p" role="status" aria-live="polite">
        {announce}
      </VisuallyHidden>
      <TourHeader
        hotelName={resolvedHotelName}
        hotelSlug={manifest.hotelSlug}
        backHref={backHref}
        surface={surface}
      />
      {resumeBanner}

      <Group
        align="stretch"
        wrap="nowrap"
        gap={16}
        style={{
          position: "fixed",
          top: "var(--er-header-h)",
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
            flex: "0 0 420px",
            overflow: "hidden",
            zIndex: 44,
            borderRadius: "var(--er-radius-md)",
            border: "1px solid var(--er-line)",
            background: "var(--er-surface)",
            boxShadow: "var(--er-shadow)",
          }}
        >
          {guidePanel}
        </Box>
      </Group>
    </Box>
  );
}

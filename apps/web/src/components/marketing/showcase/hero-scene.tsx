"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { IconPlayerPauseFilled, IconPlayerPlayFilled, IconRoute, IconSparkles } from "@tabler/icons-react";
import type { ShowcaseScript } from "@/lib/marketing/showcase-config";
import { STILL_TIME, sceneAt, type SceneDialog } from "./scene-timeline";

const TICK_MS = 50;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/**
 * Banner sahnesi: video tur + yapay zekâ rehberi, kendi kendine oynar.
 * Süs amaçlıdır (aria-hidden); aynı anlatım sahnenin altındaki metinde ve
 * sayfanın bölümlerinde yazılı olarak bulunur.
 */
export function ShowcaseHeroScene({ dialog, script }: { dialog: SceneDialog; script: ShowcaseScript }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);
  const reducedMotion = usePrefersReducedMotion();
  const [elapsed, setElapsed] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);

  // Videolar sayfa tamamen yüklendikten sonra indirilir: yavaş mobil ağda
  // 0,5 MB'lık klip kapak görselinden ve sayfadan bant genişliği çalıyordu
  // (LCP 13 sn). O zamana kadar her durağın kapak görseli görünür.
  const [mediaAllowed, setMediaAllowed] = useState(false);
  const [readyStops, setReadyStops] = useState<ReadonlySet<number>>(() => new Set());

  useEffect(() => {
    let timer = 0;
    const allow = () => {
      timer = window.setTimeout(() => setMediaAllowed(true), 400);
    };
    if (document.readyState === "complete") allow();
    else window.addEventListener("load", allow, { once: true });
    return () => {
      window.removeEventListener("load", allow);
      window.clearTimeout(timer);
    };
  }, []);

  const playing = !reducedMotion && !userPaused && inView && pageVisible;
  const loadVideos = mediaAllowed && !reducedMotion;
  const frame = sceneAt(reducedMotion ? STILL_TIME : elapsed, dialog, script);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setInView(Boolean(entry?.isIntersecting)), {
      threshold: 0.25,
    });
    observer.observe(el);
    const onVisibility = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setElapsed((e) => e + TICK_MS), TICK_MS);
    return () => window.clearInterval(id);
  }, [playing]);

  // Yalnız etkin durağın videosu oynar; diğerleri durur.
  useEffect(() => {
    videoRefs.current.forEach((video, i) => {
      if (!video) return;
      if (playing && loadVideos && i === frame.stop) {
        void video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, [playing, loadVideos, frame.stop]);

  return (
    <div className="ths-wrap">
      <div
        ref={rootRef}
        className="ths-scene"
        data-fading={frame.fading || undefined}
        data-still={reducedMotion || undefined}
        aria-hidden
      >
        <div className="ths-media">
          {/* Temsili stok klipler — kaynak ve lisans: public/marketing/<yüzey>/KAYNAKLAR.md */}
          {/* İlk kapak hemen (LCP); diğerleri sayfa yüklenince — ilk kapakla yarışmasın. */}
          {script.stops.map((stop, i) => (i === 0 || mediaAllowed) && (
            <Image
              key={`${stop.id}-poster`}
              className="ths-poster"
              data-active={i === frame.stop || undefined}
              src={`${stop.media}.jpg`}
              alt=""
              fill
              priority={i === 0}
              sizes="(max-width: 48em) 100vw, 600px"
              style={stop.focus ? { objectPosition: stop.focus } : undefined}
            />
          ))}
          {script.stops.map((stop, i) => (
            <video
              key={stop.id}
              ref={(el) => {
                videoRefs.current[i] = el;
              }}
              className="ths-video"
              data-active={i === frame.stop || undefined}
              data-ready={readyStops.has(i) || undefined}
              src={loadVideos ? `${stop.media}.mp4` : undefined}
              style={stop.focus ? { objectPosition: stop.focus } : undefined}
              muted
              loop
              playsInline
              preload="none"
              tabIndex={-1}
              onPlaying={() => setReadyStops((prev) => (prev.has(i) ? prev : new Set(prev).add(i)))}
            />
          ))}
          <div className="ths-steam" />
          <div className="ths-shade" />
        </div>

        <div className="ths-topbar">
          <span className="ths-live">
            <span className="ths-live-dot" />
            Video tur
          </span>
          <span className="ths-stock">Temsili video</span>
        </div>

        <div className="ths-chat">
          <div className="ths-chat-head">
            <span className="ths-avatar">
              <IconSparkles size={14} />
            </span>
            Yapay Zeka Rehberi
          </div>
          <div className="ths-messages">
            {frame.messages.map((m) => (
              <div key={m.id} className="ths-msg" data-role={m.role}>
                <p>
                  {m.text}
                  {m.typing ? <span className="ths-caret" /> : null}
                </p>
                {m.card ? (
                  <div className="ths-card">
                    <span className="ths-card-label">{m.card.label}</span>
                    <span className="ths-card-source">Kaynak: {m.card.source} bilgileri</span>
                  </div>
                ) : null}
              </div>
            ))}
            {frame.thinking ? (
              <div className="ths-msg ths-thinking" data-role="guide">
                <span />
                <span />
                <span />
              </div>
            ) : null}
          </div>
          <div className="ths-autotour" data-pressed={frame.autoTourPressed || undefined}>
            <IconRoute size={15} />
            Oteli gezdir
          </div>
        </div>

        <ol className="ths-rail">
          {script.stops.map((stop, i) => (
            <li key={stop.id} data-state={i < frame.stop ? "done" : i === frame.stop ? "active" : "next"}>
              <span className="ths-rail-bar">
                <span
                  style={{
                    transform: `scaleX(${i < frame.stop ? 1 : i === frame.stop ? frame.stopProgress : 0})`,
                  }}
                />
              </span>
              {stop.label}
            </li>
          ))}
        </ol>
      </div>

      {!reducedMotion ? (
        <button
          type="button"
          className="ths-toggle"
          onClick={() => setUserPaused((p) => !p)}
          aria-label={userPaused ? "Tanıtım animasyonunu oynat" : "Tanıtım animasyonunu duraklat"}
        >
          {userPaused ? <IconPlayerPlayFilled size={14} /> : <IconPlayerPauseFilled size={14} />}
        </button>
      ) : null}

      <p className="er-visually-hidden">
        Tanıtım: misafir video tur sırasında &ldquo;{dialog.question}&rdquo; diye soruyor; yapay zekâ
        rehberi {dialog.hotelName} otelinin kendi bilgisinden &ldquo;{dialog.answer}&rdquo; cevabını
        veriyor; misafir &ldquo;{script.followUp}&rdquo; deyince tur {script.stops[1].label.toLocaleLowerCase("tr-TR")}{" "}
        durağına, &ldquo;Oteli gezdir&rdquo; deyince {script.stops[2].label.toLocaleLowerCase("tr-TR")} durağına geçiyor.
      </p>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import {
  IconMicrophone,
  IconRoute,
  IconSearch,
  IconShieldCheck,
  IconSparkles,
} from "@tabler/icons-react";
import type { ShowcaseConfig } from "@/lib/marketing/showcase-config";

/** İstemciye giden kısım — demo soruları (RegExp) sunucuda kalır. */
export type AiStepsConfig = Pick<ShowcaseConfig, "script" | "aiExamples">;

function stepsFor(config: AiStepsConfig) {
  const { script } = config;
  return [
  {
    id: "arama",
    Icon: IconSearch,
    title: "Kendi cümlenizle arayın",
    body: `“${config.aiExamples.search}” yazın. Yapay zekâ cümlenizi şehir, olanak, pansiyon tipi ve otel sınıfına ayırır, otelleri buna göre süzer.`,
  },
  {
    id: "yonlendirme",
    Icon: IconRoute,
    title: "Turu sözle yönetin",
    body: `Video tur sırasında “${script.followUp}” deyin; rehber sizi o durağa götürür. “Oteli gezdir” derseniz bütün durakları sırayla anlatır.`,
  },
  {
    id: "dogruluk",
    Icon: IconShieldCheck,
    title: "Uydurmayan cevaplar",
    body: "Rehber yalnız otelin kendi girdiği bilgilerden cevap verir ve kaynağını kartla gösterir. Bilgi kayıtlı değilse tahmin etmez, “otele soralım” der.",
  },
  {
    id: "ses",
    Icon: IconMicrophone,
    title: "Sesli sorun",
    body: "Yazmak istemezseniz mikrofona dokunun, sorunuzu söyleyin. Türkçe ya da İngilizce sorabilirsiniz.",
  },
  ] as const;
}

type StepId = ReturnType<typeof stepsFor>[number]["id"];

/** Doğruluk görselindeki örnek — banner'daki gerçek otel bilgisiyle aynı. */
export interface StepFact {
  question: string;
  answer: string;
  hotelName: string;
}

/** Her adımın küçük, CSS ile canlanan görseli. */
function StepVisual({ id, fact, config }: { id: StepId; fact: StepFact | null; config: AiStepsConfig }) {
  const { script, aiExamples } = config;
  switch (id) {
    case "arama":
      return (
        <div className="tai-visual tai-search">
          <div className="tai-searchbox">
            <IconSparkles size={16} />
            <span className="tai-type">{aiExamples.search}</span>
          </div>
          <div className="tai-chips">
            {aiExamples.searchChips.map((chip) => (
              <span key={chip}>{chip}</span>
            ))}
          </div>
          <ul className="tai-results">
            <li />
            <li />
            <li />
          </ul>
        </div>
      );
    case "yonlendirme":
      return (
        <div className="tai-visual tai-route">
          <div className="tai-bubble" data-role="guest">{script.followUp}</div>
          <ol className="tai-stops">
            {script.stops.map((stop, i) => (
              <li key={stop.id} data-active={i === 1 ? "" : undefined}>
                {stop.label}
              </li>
            ))}
          </ol>
          <div className="tai-bubble" data-role="guide">{script.followUpReply}</div>
        </div>
      );
    case "dogruluk":
      return (
        <div className="tai-visual tai-truth">
          {fact ? (
            <div className="tai-truth-row">
              <div className="tai-bubble" data-role="guest">{fact.question}</div>
              <div className="tai-fact">
                <span className="tai-fact-label">{fact.hotelName} bilgisi</span>
                {fact.answer}
              </div>
            </div>
          ) : null}
          <div className="tai-truth-row">
            <div className="tai-bubble" data-role="guest">Golf sahası var mı?</div>
            <div className="tai-unknown">
              Bu konuda doğrulanmış bilgim yok.
              <span className="tai-ask">Otele soralım →</span>
            </div>
          </div>
        </div>
      );
    case "ses":
      return (
        <div className="tai-visual tai-voice">
          <span className="tai-mic">
            <IconMicrophone size={28} />
          </span>
          <div className="tai-wave" aria-hidden>
            {Array.from({ length: 18 }, (_, i) => (
              <span key={i} style={{ animationDelay: `${(i % 6) * 0.11}s` }} />
            ))}
          </div>
          <p>{aiExamples.voice}</p>
        </div>
      );
  }
}

/**
 * Masaüstünde görsel solda sabit kalır, kaydırdıkça adım değişir.
 * Mobilde her adım kendi görseliyle alt alta durur.
 */
export function ShowcaseAiSteps({ fact, config }: { fact: StepFact | null; config: AiStepsConfig }) {
  const steps = stepsFor(config);
  const [active, setActive] = useState<StepId>("arama");
  const refs = useRef<Record<string, HTMLElement | null>>({});
  // Mobil: adımlar yana kaydırılan kartlar; noktalar hangi kartta olunduğunu gösterir.
  const railRef = useRef<HTMLOListElement>(null);
  const [railIndex, setRailIndex] = useState(0);
  const onRailScroll = () => {
    const rail = railRef.current;
    if (!rail || !rail.firstElementChild) return;
    const width = (rail.firstElementChild as HTMLElement).offsetWidth || 1;
    setRailIndex(Math.round(rail.scrollLeft / width));
  };
  const goTo = (i: number) => {
    const card = railRef.current?.children[i] as HTMLElement | undefined;
    card?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  };

  // Etkin adım: ortası ekranın ortasına en yakın olan. (Görünürlük
  // gözlemcisi yalnız değişen öğeleri bildirdiği için kaydırmada atlıyordu.)
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const center = window.innerHeight / 2;
      let best: { id: StepId; distance: number } | null = null;
      for (const [id, el] of Object.entries(refs.current)) {
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - center);
        if (!best || distance < best.distance) best = { id: id as StepId, distance };
      }
      if (best) setActive(best.id);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="tai-layout">
      <div className="tai-sticky" aria-hidden>
        <div className="tai-stage">
          {steps.map((s) => (
            <div key={s.id} className="tai-stage-item" data-active={s.id === active || undefined}>
              <StepVisual id={s.id} fact={fact} config={config} />
            </div>
          ))}
        </div>
      </div>
      <ol className="tai-steps" ref={railRef} onScroll={onRailScroll}>
        {steps.map((s, i) => {
          const Icon = s.Icon;
          return (
            <li
              key={s.id}
              ref={(el) => {
                refs.current[s.id] = el;
              }}
              data-step={s.id}
              data-active={s.id === active || undefined}
              className="tai-step"
            >
              <span className="tai-step-icon" aria-hidden>
                <Icon size={18} />
              </span>
              <span className="tai-step-number">0{i + 1}</span>
              <h3 className="er-display">{s.title}</h3>
              <p>{s.body}</p>
              <div className="tai-inline-visual" aria-hidden>
                <StepVisual id={s.id} fact={fact} config={config} />
              </div>
            </li>
          );
        })}
      </ol>
      <div className="tai-dots" role="tablist" aria-label="Adımlar">
        {steps.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={i === railIndex}
            aria-label={`${i + 1}. adım: ${s.title}`}
            data-active={i === railIndex || undefined}
            onClick={() => goTo(i)}
          />
        ))}
      </div>
    </div>
  );
}

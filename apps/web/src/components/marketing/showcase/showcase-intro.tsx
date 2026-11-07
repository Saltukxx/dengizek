import { Fragment, type ReactNode } from "react";
import {
  IconArrowRight,
  IconCircleCheck,
  IconFileText,
  IconMessageCircle,
  IconPhoneCall,
  IconPhoto,
  IconShieldCheck,
  IconVideo,
} from "@tabler/icons-react";
import { hotelChatStarters, type HotelChatStarterInput } from "@/lib/ai/hotel-page-chat";
import { guestPaths } from "@/lib/guest-surface";
import type { ShowcaseConfig } from "@/lib/marketing/showcase-config";
import type { ShowcaseDemoDialog } from "@/lib/marketing/showcase-demo";
import { ShowcaseAiSteps } from "./ai-steps";
import { ShowcaseHeroScene } from "./hero-scene";
import { Reveal } from "./reveal";
import { ShowcaseTryChat } from "./try-chat";
import "./showcase.css";

/** Klasik otel sitesi ↔ Otelsayfam. */
const COMPARISON = [
  { Icon: IconPhoto, classic: "Fotoğraf galerisi", ours: "Duraklı video tur", OursIcon: IconVideo },
  { Icon: IconFileText, classic: "Uzun broşür metni", ours: "Soru sorun, cevap alın", OursIcon: IconMessageCircle },
  { Icon: IconPhoneCall, classic: "“Bilgi için arayın”", ours: "Anında, kaynağı gösterilen cevap", OursIcon: IconShieldCheck },
] as const;

/** Rakam şeridi bu kadar otelden azsa gösterilmez ("1 otel yayında" tanıtım değildir). */
const MIN_HOTELS_FOR_STATS = 5;

/** Kayıtlı olmayan bir şey — rehberin tahmin etmediğini gösterir. */
const UNKNOWN_QUESTION = "Golf sahası var mı?";

export interface ShowcaseIntroProps {
  config: ShowcaseConfig;
  dialog: ShowcaseDemoDialog | null;
  /** Demo otelinin içeriği — "Kendin dene" hazır soruları için. */
  demoContent: HotelChatStarterInput | null;
  hotelCount: number;
  provinceCount: number;
  /** Banner'daki arama alanı — yüzeye göre form ya da yapay zekâ araması. */
  heroSearch: ReactNode;
  /** Banner'ın hemen altında, tanıtım bölümlerinden önce (öne çıkan oteller). */
  afterHero?: ReactNode;
}

/**
 * "Otelsayfam neden farklı?" — yaz, kış ve termal ana sayfalarının ortak
 * tanıtım bölümleri. Renkler yüzey kabuğunun tokenlarından gelir
 * (data-surface ile banner tonları, bkz. showcase.css).
 */
export function ShowcaseIntro({
  config,
  dialog,
  demoContent,
  hotelCount,
  provinceCount,
  heroSearch,
  afterHero,
}: ShowcaseIntroProps) {
  const paths = guestPaths(config.surface);
  const starterQuestions = dialog
    ? [...new Set([dialog.question, ...(demoContent ? hotelChatStarters(demoContent, 2) : []), UNKNOWN_QUESTION])]
    : [];

  return (
    <>
      {/* ── Banner ─────────────────────────────────────────────────────────── */}
      <section className="tm-hero">
        <div className="tm-hero-glow" aria-hidden />
        <div className="er-container tm-hero-inner">
          <div className="tm-hero-copy">
            <h1 className="er-display tm-headline">
              {config.headline.map((word, i) => (
                <Fragment key={i}>
                  <span style={{ ["--i" as string]: i }}>{word}</span>
                  {i < config.headline.length - 1 ? " " : null}
                </Fragment>
              ))}
            </h1>
            <p className="tm-lede">{config.lede}</p>
            <div className="tm-hero-search">{heroSearch}</div>
            <ul className="tm-trust" aria-label="Otelsayfam güvenceleri">
              <li><IconVideo size={17} aria-hidden /> Video tur</li>
              <li><IconShieldCheck size={17} aria-hidden /> Kaynağı gösterilen cevap</li>
              <li><IconCircleCheck size={17} aria-hidden /> Doğrudan talep</li>
            </ul>
          </div>

          {dialog ? (
            <ShowcaseHeroScene
              dialog={{
                question: dialog.question,
                answer: dialog.answer,
                cardLabel: dialog.cardLabel,
                hotelName: dialog.hotelName,
              }}
              script={config.script}
            />
          ) : null}
        </div>
      </section>

      {/* ── Rakamlar ───────────────────────────────────────────────────────── */}
      {hotelCount >= MIN_HOTELS_FOR_STATS && (
        <section className="er-container tm-stats" aria-label="Vitrin rakamları">
          <Reveal className="tm-stats-grid">
            <div>
              <strong>{hotelCount}</strong>
              <span>{config.stats.hotels}</span>
            </div>
            <div>
              <strong>{provinceCount}</strong>
              <span>{config.stats.provinces}</span>
            </div>
            <div>
              <strong>7/24</strong>
              <span>rehber cevap verir</span>
            </div>
          </Reveal>
        </section>
      )}

      {afterHero}

      {/* ── Farkımız ───────────────────────────────────────────────────────── */}
      <section className="er-container er-section tm-compare">
        <Reveal className="tm-section-head">
          <p className="tm-eyebrow">Otelsayfam neden farklı?</p>
          <h2 className="er-display er-h2">Diğer siteler fotoğraf gösterir. Biz oteli gezdiririz.</h2>
        </Reveal>
        <Reveal className="tm-compare-table">
          <div className="tm-compare-head" aria-hidden>
            <span>Klasik otel sitesi</span>
            <span>Otelsayfam</span>
          </div>
          <ul>
            {COMPARISON.map(({ Icon, classic, ours, OursIcon }, i) => (
              <li key={classic} style={{ ["--i" as string]: i }}>
                <span className="tm-compare-classic">
                  <Icon size={18} aria-hidden />
                  <span className="er-visually-hidden">Klasik site: </span>
                  {classic}
                </span>
                <span className="tm-compare-arrow" aria-hidden>
                  <IconArrowRight size={16} />
                </span>
                <span className="tm-compare-ours">
                  <OursIcon size={18} aria-hidden />
                  <span className="er-visually-hidden">Otelsayfam: </span>
                  {ours}
                </span>
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      {/* ── Yapay zekâ ─────────────────────────────────────────────────────── */}
      <section id="nasil-calisir" className="tm-ai">
        <div className="er-container">
          <Reveal className="tm-section-head">
            <p className="tm-eyebrow">Yapay zekâyı nerede kullanıyoruz?</p>
            <h2 className="er-display er-h2">Aramadan tura, her adımda yanınızda bir rehber</h2>
          </Reveal>
          <ShowcaseAiSteps
            config={{ script: config.script, aiExamples: config.aiExamples }}
            fact={dialog ? { question: dialog.question, answer: dialog.answer, hotelName: dialog.hotelName } : null}
          />
        </div>
      </section>

      {/* ── Kendin dene ────────────────────────────────────────────────────── */}
      {dialog ? (
        <section className="er-container er-section tm-try">
          <Reveal className="tm-try-copy">
            <p className="tm-eyebrow">Kendin dene</p>
            <h2 className="er-display er-h2">Gerçek rehber, gerçek otel bilgisi</h2>
            <p>
              Bu bir animasyon değil: {dialog.hotelName} için otel sayfasındaki rehberin aynısı.
              Kayıtlı olmayan bir şey sorun; tahmin yürütmek yerine bilmediğini söylediğini görün.
            </p>
          </Reveal>
          <ShowcaseTryChat
            hotelSlug={dialog.hotelSlug}
            hotelName={dialog.hotelName}
            starterQuestions={starterQuestions}
            inquiryPath={paths.inquiry}
            hotelHref={paths.hotel(dialog.hotelSlug)}
          />
        </section>
      ) : null}
    </>
  );
}

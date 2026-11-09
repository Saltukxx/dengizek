import Image from "next/image";
import Link from "next/link";
import { IconArrowRight, IconCheck, IconMapPin, IconSparkles, IconX } from "@tabler/icons-react";
import { type SearchResult } from "@/lib/ai/hotel-search";
import { searchHotelsSmart } from "@/lib/ai/search-interpret";
import { SEARCH_EVENT, searchLogPayload } from "@/lib/ai/search-log";
import { trackEvent } from "@/lib/analytics";
import { guestPaths, hotelPathFor, type GuestSurface } from "@/lib/guest-surface";
import { getHotelSearchIndex } from "@/lib/hotel-search-index";
import { ASSISTANT_EXAMPLES } from "./assistant-search-box";
import { PageBanner } from "./page-banner";

/** Sonuç varken önerilen takip soruları. */
const FOLLOW_UPS = ["Bunlardan hangisi havalimanına yakın?", "Peki aile odası olanlar?", "Sadece fitness olanlar", "Peki Denizli'de?"];
const MAX_CONTEXT = 5;
const MAX_QUERY = 200;

function finderHref(finder: string, q: string, context: string[]): string {
  const params = new URLSearchParams();
  for (const c of context) params.append("ctx", c);
  params.set("q", q);
  return `${finder}?${params.toString()}`;
}

function ResultCard({ result, partial, href }: { result: SearchResult; partial: boolean; href: string }) {
  return (
    <Link href={href} className="hf-card">
      {result.imageUrl ? (
        <Image
          src={result.imageUrl}
          alt=""
          width={480}
          height={340}
          sizes="(max-width: 640px) 100vw, 220px"
          className="hf-card-photo"
        />
      ) : (
        <span className="hf-card-photo hf-card-photo-empty" aria-hidden />
      )}
      <div className="hf-card-body">
        <div>
          <h3 className="er-display hf-card-title">{result.name}</h3>
          {result.city ? (
            <p className="hf-card-city">
              <IconMapPin size={14} aria-hidden /> {result.city}
            </p>
          ) : null}
        </div>
        <ul className="hf-card-list">
          {result.matched.map((m) => (
            <li key={m}>
              <IconCheck size={15} className="hf-yes" aria-label="var" />
              {m}
            </li>
          ))}
          {partial
            ? result.missing.map((m) => (
                <li key={m} className="hf-missing">
                  <IconX size={15} aria-label="yok" />
                  {m}
                </li>
              ))
            : null}
        </ul>
        <span className="hf-card-cta">
          Oteli incele <IconArrowRight size={15} aria-hidden />
        </span>
      </div>
    </Link>
  );
}

export interface HotelFinderProps {
  searchParams: Promise<{ q?: string; ctx?: string | string[] }>;
  surface: GuestSurface;
}

/**
 * Yapay zekâ ile otel arama — yaz, kış ve termal vitrinlerinin ortak sayfası.
 * Arama tüm yayındaki otellerde yapılır; her sonuç otelin kendi vitrinine
 * (bulunulan vitrin öncelikli) bağlanır.
 */
export async function HotelFinder({ searchParams, surface }: HotelFinderProps) {
  const sp = await searchParams;
  const finder = guestPaths(surface).finder;
  const q = (sp.q ?? "").trim().slice(0, MAX_QUERY);
  const context = (Array.isArray(sp.ctx) ? sp.ctx : sp.ctx ? [sp.ctx] : [])
    .map((c) => c.trim().slice(0, MAX_QUERY))
    .filter(Boolean)
    .slice(-MAX_CONTEXT);
  const index = q ? await getHotelSearchIndex() : [];
  const response = q ? await searchHotelsSmart(q, index, context) : null;
  if (response) void trackEvent(SEARCH_EVENT, { ...searchLogPayload(q, response) });
  const list = response ? (response.results.length ? response.results : response.partial) : [];
  const seasonsBySlug = new Map(index.map((h) => [h.slug, h.seasons]));
  // Sonraki takip sorusunun bağlamı: bu sonucu üreten aramalar.
  const nextContext = response && (response.results.length || response.partial.length) ? response.chain.slice(-MAX_CONTEXT) : [];

  return (
    <>
      <PageBanner
        eyebrow={
          <>
            <IconSparkles size={15} aria-hidden /> Arama asistanı
          </>
        }
        title="Nasıl bir otel arıyorsunuz?"
        lede="Şehir, olanak, oda büyüklüğü, pansiyon tipi ya da otelin adını kendi cümlenizle yazın. Sonuçlar otellerin kendi bilgilerinden gelir."
      >
        {response && response.chain.length > 1 ? (
          <p className="hf-chain">
            <span>Aramanız:</span>
            {response.chain.map((step, i) => (
              <span key={`${i}-${step}`}>
                {i > 0 ? "→ " : ""}
                <strong>{step}</strong>
              </span>
            ))}
            <Link href={finder}>Baştan başla</Link>
          </p>
        ) : null}

        <form method="GET" action={finder} className="er-search-bar hf-form">
          {nextContext.map((c, i) => (
            <input key={`${i}-${c}`} type="hidden" name="ctx" value={c} />
          ))}
          <div className="er-input-icon" style={{ gridColumn: "span 3" }}>
            <IconSparkles size={18} className="er-icon" aria-hidden />
            <input
              name="q"
              key={q}
              defaultValue={nextContext.length ? "" : q}
              maxLength={MAX_QUERY}
              className="er-input"
              placeholder={nextContext.length ? "Daraltın: ör. bunlardan hangisi havalimanına yakın?" : `Örn. ${ASSISTANT_EXAMPLES[surface][0]}`}
              aria-label="Aradığınız otel"
            />
          </div>
          <button type="submit" className="er-btn er-btn-primary">Bul</button>
        </form>

        <div className="hf-chips">
          {nextContext.length
            ? FOLLOW_UPS.map((followUp) => (
                <Link key={followUp} href={finderHref(finder, followUp, nextContext)} className="hf-chip">
                  {followUp}
                </Link>
              ))
            : ASSISTANT_EXAMPLES[surface].map((example) => (
                <Link key={example} href={finderHref(finder, example, [])} className="hf-chip" data-active={example === q}>
                  {example}
                </Link>
              ))}
        </div>
      </PageBanner>

      {response ? (
        <section className="er-container hf-results" aria-live="polite">
          <div className="hf-summary">
            <IconSparkles size={18} aria-hidden />
            <div>
              <p>{response.summary}</p>
              {response.interpretedByModel ? (
                <p className="hf-summary-note">İsteğinizi yapay zekâ ile yorumladık; sonuçlar otellerin kendi bilgilerinden geliyor.</p>
              ) : null}
            </div>
          </div>
          {list.length ? (
            <div className="hf-grid">
              {list.map((result) => (
                <ResultCard
                  key={result.slug}
                  result={result}
                  partial={!response.results.length}
                  href={hotelPathFor(result.slug, seasonsBySlug.get(result.slug), surface)}
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : (
        <section className="er-container hf-results hf-empty">
          <p>Bir istek yazın ya da yukarıdaki örneklerden birini seçin.</p>
        </section>
      )}
    </>
  );
}

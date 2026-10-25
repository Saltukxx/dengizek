import type { Metadata } from "next";
import Link from "next/link";
import { IconSparkles, IconCheck, IconX } from "@tabler/icons-react";
import { type SearchResult } from "@/lib/ai/hotel-search";
import { searchHotelsSmart } from "@/lib/ai/search-interpret";
import { getHotelSearchIndex } from "@/lib/hotel-search-index";
import { guestShareMeta } from "@/lib/guest-seo";
import { trackEvent } from "@/lib/analytics";
import { SEARCH_EVENT, searchLogPayload } from "@/lib/ai/search-log";

export const metadata: Metadata = guestShareMeta({
  title: "Otel bul",
  description: "İstediğiniz özellikleri yazın, size uyan otelleri bulalım.",
});

const EXAMPLES = [
  "Afyon'da çocuk havuzu olan otel",
  "Spor salonu ve hamamı olan otel",
  "Havalimanına yakın otel",
  "4 kişilik aile odası olan otel",
  "Denizli'de jakuzili otel",
];

const MAX_QUERY = 200;

function ResultCard({ result, partial }: { result: SearchResult; partial: boolean }) {
  return (
    <Link href={`/hotels/${result.slug}`} className="er-card" style={{ display: "flex", gap: 16, padding: 14, alignItems: "stretch" }}>
      {result.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={result.imageUrl} alt="" style={{ width: 132, minHeight: 96, objectFit: "cover", borderRadius: 10, flexShrink: 0 }} />
      ) : null}
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <div>
          <h3 className="er-h3 er-display" style={{ fontSize: 17, margin: 0 }}>{result.name}</h3>
          {result.city ? <p style={{ margin: 0, fontSize: 13, color: "var(--er-text-muted)" }}>{result.city}</p> : null}
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 3, fontSize: 13 }}>
          {result.matched.map((m) => (
            <li key={m} style={{ display: "flex", gap: 6, alignItems: "flex-start", overflowWrap: "anywhere" }}>
              <IconCheck size={15} color="var(--er-success, #16a34a)" style={{ flexShrink: 0, marginTop: 2 }} aria-label="var" />
              {m}
            </li>
          ))}
          {partial
            ? result.missing.map((m) => (
                <li key={m} style={{ display: "flex", gap: 6, alignItems: "flex-start", color: "var(--er-text-muted)", overflowWrap: "anywhere" }}>
                  <IconX size={15} style={{ flexShrink: 0, marginTop: 2 }} aria-label="yok" />
                  {m}
                </li>
              ))
            : null}
        </ul>
      </div>
    </Link>
  );
}

/** Sonuç varken önerilen takip soruları. */
const FOLLOW_UPS = ["Bunlardan hangisi havalimanına yakın?", "Peki aile odası olanlar?", "Sadece fitness olanlar", "Peki Denizli'de?"];
const MAX_CONTEXT = 5;

function finderHref(q: string, context: string[]): string {
  const params = new URLSearchParams();
  for (const c of context) params.append("ctx", c);
  params.set("q", q);
  return `/otel-bul?${params.toString()}`;
}

export default async function HotelFinderPage({ searchParams }: { searchParams: Promise<{ q?: string; ctx?: string | string[] }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, MAX_QUERY);
  const context = (Array.isArray(sp.ctx) ? sp.ctx : sp.ctx ? [sp.ctx] : [])
    .map((c) => c.trim().slice(0, MAX_QUERY))
    .filter(Boolean)
    .slice(-MAX_CONTEXT);
  const response = q ? await searchHotelsSmart(q, await getHotelSearchIndex(), context) : null;
  if (response) void trackEvent(SEARCH_EVENT, { ...searchLogPayload(q, response) });
  const list = response ? (response.results.length ? response.results : response.partial) : [];
  // Sonraki takip sorusunun bağlamı: bu sonucu üreten aramalar.
  const nextContext = response && (response.results.length || response.partial.length) ? response.chain.slice(-MAX_CONTEXT) : [];

  return (
    <div className="er-container" style={{ paddingTop: 32, paddingBottom: 64, maxWidth: 880 }}>
      <p className="er-eyebrow" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <IconSparkles size={16} /> Arama asistanı
      </p>
      <h1 className="er-display" style={{ marginTop: 4 }}>Nasıl bir otel arıyorsunuz?</h1>
      <p style={{ color: "var(--er-text-muted)", marginTop: 8 }}>
        Şehir, olanak, oda büyüklüğü ya da pansiyon tipini kendi cümlenizle yazın. Sonuçlar otellerin kendi bilgilerinden gelir.
      </p>

      {response && response.chain.length > 1 ? (
        <p style={{ marginTop: 16, fontSize: 14, color: "var(--er-text-muted)", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <span>Aramanız:</span>
          {response.chain.map((step, i) => (
            <span key={`${i}-${step}`}>
              {i > 0 ? "→ " : ""}
              <strong style={{ color: "var(--er-text)" }}>{step}</strong>
            </span>
          ))}
          <Link href="/otel-bul" style={{ marginLeft: 8, color: "var(--er-primary)", fontWeight: 600 }}>Baştan başla</Link>
        </p>
      ) : null}

      <form method="GET" action="/otel-bul" className="er-search-bar" style={{ marginTop: 20 }}>
        {nextContext.map((c, i) => (
          <input key={`${i}-${c}`} type="hidden" name="ctx" value={c} />
        ))}
        <div className="er-input-icon" style={{ gridColumn: "span 3" }}>
          <IconSparkles size={18} className="er-icon" />
          <input
            name="q"
            key={q}
            defaultValue={nextContext.length ? "" : q}
            maxLength={MAX_QUERY}
            className="er-input"
            placeholder={nextContext.length ? "Daraltın: ör. bunlardan hangisi havalimanına yakın?" : "Örn. Afyon'da çocuk havuzu olan otel"}
            aria-label="Aradığınız otel"
          />
        </div>
        <button type="submit" className="er-btn er-btn-primary">Bul</button>
      </form>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
        {nextContext.length
          ? FOLLOW_UPS.map((followUp) => (
              <Link key={followUp} href={finderHref(followUp, nextContext)} className="er-chip">
                {followUp}
              </Link>
            ))
          : EXAMPLES.map((example) => (
              <Link key={example} href={finderHref(example, [])} className="er-chip" data-active={example === q}>
                {example}
              </Link>
            ))}
      </div>

      {response ? (
        <section style={{ marginTop: 28 }} aria-live="polite">
          <p className="er-card" style={{ padding: "12px 16px", margin: 0, fontWeight: 500 }}>
            {response.summary}
            {response.interpretedByModel ? (
              <span style={{ display: "block", marginTop: 4, fontSize: 12, fontWeight: 400, color: "var(--er-text-muted)" }}>
                İsteğinizi yapay zekâ ile yorumladık; sonuçlar otellerin kendi bilgilerinden geliyor.
              </span>
            ) : null}
          </p>
          {list.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
              {list.map((result) => (
                <ResultCard key={result.slug} result={result} partial={!response.results.length} />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

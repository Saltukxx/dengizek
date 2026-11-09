import type { Metadata } from "next";
import Link from "next/link";
import { IconArrowRight, IconChevronRight, IconDroplet, IconMapPin } from "@tabler/icons-react";
import { HotelCard } from "@/components/marketing";
import { ViewTracker } from "@/components/guest/analytics-tracker";
import { OwnerBand } from "@/components/guest/owner-band";
import { StayFields } from "@/components/guest/stay-fields";
import { parseStaySearch } from "@/lib/stay-search";
import { ShowcaseIntro } from "@/components/marketing/showcase/showcase-intro";
import { getPublishedHotelContent, getPublishedHotelsForBrowse } from "@/lib/hotels-repo";
import { topCities } from "@/lib/guest-city-groups";
import { guestShareMeta } from "@/lib/guest-seo";
import { SHOWCASE_CONFIGS } from "@/lib/marketing/showcase-config";
import { getShowcaseDemoDialog } from "@/lib/marketing/showcase-demo";

export const metadata: Metadata = guestShareMeta({
  title: "Termal oteller",
  description:
    "Termal otelleri gitmeden video turla gezin; merak ettiğinizi yapay zekâ rehberine sorun, cevabı otelin kendi bilgisinden alın.",
  imageUrl: "/marketing/termal/termal-havuz.jpg",
});

/** Termal vitrininde gösterilen öne çıkan otel sayısı. */
const FEATURED_COUNT = 6;

export default async function ThermalHomePage() {
  const published = await getPublishedHotelsForBrowse({ season: "termal" });
  const withTour = published.filter((h) => h.tourId);

  // Turu olan tesisler önce, kalan yer diğerleriyle dolar.
  const featured = [...withTour, ...published.filter((h) => !h.tourId)].slice(0, FEATURED_COUNT);
  const regions = topCities(published, 8);
  const provinceCount = topCities(published, Number.MAX_SAFE_INTEGER).length;

  // Sahne ve "Kendin dene" aynı gerçek otel bilgisini kullanır.
  const dialog = await getShowcaseDemoDialog("termal", published);
  const demoContent = dialog ? await getPublishedHotelContent(dialog.hotelSlug) : null;

  return (
    <div className="tm-home" data-surface="termal">
      <ViewTracker eventType="page_view" payload={{ page: "termal-home", season: "termal" }} />

      <ShowcaseIntro
        config={SHOWCASE_CONFIGS.termal}
        dialog={dialog}
        demoContent={demoContent}
        hotelCount={published.length}
        provinceCount={provinceCount}
        heroSearch={
          <form method="GET" action="/termal/oteller" className="tm-stay-search">
            <label className="tm-stay-search-where" htmlFor="q">
              <span className="sf-label">
                <IconMapPin size={15} aria-hidden /> Bölge ya da otel
              </span>
              <input id="q" name="q" className="sf-input" placeholder="Afyon, Pamukkale, Yalova…" autoComplete="off" />
            </label>
            <div className="tm-stay-search-row">
              <StayFields defaultValue={parseStaySearch({})} named />
              <button type="submit" className="er-btn er-btn-primary">
                Termal Otelleri Bul
                <IconArrowRight size={16} aria-hidden />
              </button>
            </div>
          </form>
        }
        afterHero={
          <>
      {/* ── Öne çıkan oteller ──────────────────────────────────────────────── */}
      <section className="er-container er-section">
        <div className="er-section-head">
          <div>
            <p className="tm-eyebrow">Termal koleksiyonu</p>
            <h2 className="er-display er-h2">Öne çıkan termal oteller</h2>
            <p className="er-lede" style={{ marginTop: 6 }}>
              {published.length > 0
                ? `${published.length} termal otel yayında.`
                : "Termal tatil için seçilmiş tesisler."}
            </p>
          </div>
          <Link
            href="/termal/oteller"
            className="er-link"
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            Tümünü gör
            <IconChevronRight size={16} />
          </Link>
        </div>

        {featured.length === 0 ? (
          <div className="er-card" style={{ padding: 32, textAlign: "center" }}>
            <IconDroplet
              size={22}
              stroke={1.5}
              style={{ color: "var(--er-text-dim)", marginBottom: 12 }}
            />
            <p className="er-muted" style={{ margin: 0 }}>
              Termal sezon için henüz yayında tesis yok. Panelden tesis kartında
              &ldquo;Termal tatil&rdquo; seçilip yayımlandığında burada listelenir.
            </p>
          </div>
        ) : (
          <div className="er-card-grid mobile-rail">
            {featured.map((h) => (
              <HotelCard
                key={h.slug}
                hotel={{
                  slug: h.slug,
                  name: h.name,
                  city: h.city ?? "",
                  country: h.country ?? "",
                  shortDescription: h.shortDescription ?? "",
                  longDescription: h.longDescription ?? "",
                  imageUrl: h.imageUrl ?? "",
                  priceLabel: h.priceLabel ?? undefined,
                  roomTypes: [],
                }}
                reviewAverage={h.reviewAverage}
                reviewCount={h.reviewCount}
                starRating={h.starRating}
                amenities={h.amenities}
                minPriceMinor={h.minPriceMinor}
                upcomingPrice={h.upcomingPrice}
                hasTour={Boolean(h.tourId)}
                promotionBadge={h.promotionBadge}
                href={`/termal/oteller/${h.slug}`}
              />
            ))}
          </div>
        )}
      </section>
          </>
        }
      />

      {/* ── Bölgeler ───────────────────────────────────────────────────────── */}
      {regions.length > 0 && (
        <section className="er-container er-section er-thermal-regions">
          <p className="tm-eyebrow">Termal bölgeler</p>
          <h2 className="er-display er-h2">Kaplıca bölgesine göre başlayın</h2>
          <ul className="er-thermal-region-list">
            {regions.map((r) => (
              <li key={r.label}>
                <Link href={`/termal/oteller?q=${encodeURIComponent(r.query)}`}>
                  <span>{r.label}</span>
                  <small>{r.count} otel</small>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <OwnerBand />
    </div>
  );
}

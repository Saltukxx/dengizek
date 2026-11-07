import type { Metadata } from "next";
import Link from "next/link";
import { IconArrowRight, IconChevronRight, IconSnowflake } from "@tabler/icons-react";
import { HotelCard } from "@/components/marketing";
import { ViewTracker } from "@/components/guest/analytics-tracker";
import { OwnerBand } from "@/components/guest/owner-band";
import { ShowcaseIntro } from "@/components/marketing/showcase/showcase-intro";
import { getPublishedHotelContent, getPublishedHotelsForBrowse } from "@/lib/hotels-repo";
import { topCities } from "@/lib/guest-city-groups";
import { guestShareMeta } from "@/lib/guest-seo";
import { SHOWCASE_CONFIGS } from "@/lib/marketing/showcase-config";
import { getShowcaseDemoDialog } from "@/lib/marketing/showcase-demo";

export const metadata: Metadata = guestShareMeta({
  title: "Kış tatili otelleri",
  description:
    "Kayak otellerini gitmeden video turla gezin; merak ettiğinizi yapay zekâ rehberine sorun, cevabı otelin kendi bilgisinden alın.",
});

export default async function WinterHomePage() {
  const published = await getPublishedHotelsForBrowse({ season: "kis" });
  const hotels = published.slice(0, 3);
  const provinceCount = topCities(published, Number.MAX_SAFE_INTEGER).length;

  // Sahne ve "Kendin dene" aynı gerçek otel bilgisini kullanır.
  const dialog = await getShowcaseDemoDialog("kis", published);
  const demoContent = dialog ? await getPublishedHotelContent(dialog.hotelSlug) : null;

  return (
    <div className="tm-home" data-surface="kis">
      <ViewTracker eventType="page_view" payload={{ page: "kis-home", season: "kis" }} />

      <ShowcaseIntro
        config={SHOWCASE_CONFIGS.kis}
        dialog={dialog}
        demoContent={demoContent}
        hotelCount={published.length}
        provinceCount={provinceCount}
        heroSearch={
          <form method="GET" action="/kis/oteller" className="tm-search">
            <label className="er-visually-hidden" htmlFor="q">
              Kayak merkezi
            </label>
            <input id="q" name="q" className="er-input" placeholder="Uludağ, Palandöken…" autoComplete="off" />
            <button type="submit" className="er-btn er-btn-cta">
              Kış Otellerini Bul
              <IconArrowRight size={16} aria-hidden />
            </button>
          </form>
        }
        afterHero={
      <section className="er-container er-section er-winter-featured">
        <div className="er-winter-section-head">
          <div>
            <p className="tm-eyebrow">Kış koleksiyonu</p>
            <h2 className="er-display er-h2">Karın içindeki seçkin konaklamalar</h2>
            <p className="er-lede" style={{ marginTop: 6 }}>
              Yalnızca kış sezonuna seçilmiş, video turu yayındaki tesisler.
            </p>
          </div>
          <Link
            href="/kis/oteller"
            className="er-link"
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            Tümünü gör
            <IconChevronRight size={16} />
          </Link>
        </div>

        {hotels.length === 0 ? (
          <div className="er-card" style={{ padding: 32, textAlign: "center" }}>
            <IconSnowflake
              size={22}
              stroke={1.5}
              style={{ color: "var(--er-text-dim)", marginBottom: 12 }}
            />
            <p className="er-muted" style={{ margin: 0 }}>
              Kış sezonu için henüz yayında tesis yok. Panelden tesis kartında
              &ldquo;Kış tatili&rdquo; seçilip yayımlandığında burada listelenir.
            </p>
          </div>
        ) : (
          <div
            className="mobile-rail"
            style={{
              display: "grid",
              // auto-fit: iki kart satırı paylaşır, boş kolon kalmaz.
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
              gap: 20,
              maxWidth: hotels.length === 1 ? 560 : undefined,
            }}
          >
            {hotels.map((h) => (
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
                hasTour={Boolean(h.tourId)}
                promotionBadge={h.promotionBadge}
                href={`/kis/oteller/${h.slug}`}
              />
            ))}
          </div>
        )}
      </section>
        }
      />

      <OwnerBand />
    </div>
  );
}

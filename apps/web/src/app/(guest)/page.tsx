import type { Metadata } from "next";
import Link from "next/link";
import { IconArrowRight } from "@tabler/icons-react";
import { HotelCard } from "@/components/marketing";
import { AssistantSearchBox } from "@/components/guest/assistant-search-box";
import { OwnerBand } from "@/components/guest/owner-band";
import { ShowcaseIntro } from "@/components/marketing/showcase/showcase-intro";
import { getPublishedHotelContent, getPublishedHotelsForBrowse, type BrowseHotelRow } from "@/lib/hotels-repo";
import { amenityLabel, normalizeAmenities } from "@/lib/amenities-catalog";
import { guestShareMeta } from "@/lib/guest-seo";
import { topCities } from "@/lib/guest-city-groups";
import { SHOWCASE_CONFIGS } from "@/lib/marketing/showcase-config";
import { getShowcaseDemoDialog } from "@/lib/marketing/showcase-demo";

export const metadata: Metadata = guestShareMeta({
  title: "Otele gitmeden önce içini gezin",
  description:
    "Otelleri video turla gezin; lobiden odaya kendi hızınızda ilerleyin, merak ettiğinizi tur sırasında sorun.",
});

/**
 * "Ne arıyorsunuz?" kısayolları — yalnızca envanterde en az MIN_CATEGORY_COUNT
 * otelde gerçekten bulunan olanaklar gösterilir, yanında otel sayısıyla.
 */
const CATEGORY_CANDIDATES = [
  "termal-havuz",
  "ozel-plaj",
  "hamam",
  "cocuk-havuzu",
  "spa-merkezi",
  "acik-havuz",
  "her-sey-dahil",
  "fitness",
] as const;
const MIN_CATEGORY_COUNT = 3;

function topCategories(hotels: BrowseHotelRow[]) {
  const counts = new Map<string, number>();
  for (const h of hotels) {
    for (const key of normalizeAmenities(h.amenities)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return CATEGORY_CANDIDATES.map((key) => ({ key, label: amenityLabel(key), count: counts.get(key) ?? 0 }))
    .filter((c) => c.count >= MIN_CATEGORY_COUNT)
    .slice(0, 4);
}

export default async function HomePage() {
  const published = await getPublishedHotelsForBrowse({ season: "yaz" });
  const withTour = published.filter((h) => h.tourId);

  // Öne çıkanlar: turu olan oteller önce, kalan yer diğer otellerle dolar.
  const featured = [...withTour, ...published.filter((h) => !h.tourId)].slice(0, 3);
  const categories = topCategories(published);
  const cities = topCities(published);
  const provinceCount = topCities(published, Number.MAX_SAFE_INTEGER).length;

  // Sahne ve "Kendin dene" aynı gerçek otel bilgisini kullanır.
  const dialog = await getShowcaseDemoDialog("yaz", published);
  const demoContent = dialog ? await getPublishedHotelContent(dialog.hotelSlug) : null;

  return (
    <div className="tm-home" data-surface="yaz">
      <ShowcaseIntro
        config={SHOWCASE_CONFIGS.yaz}
        dialog={dialog}
        demoContent={demoContent}
        hotelCount={published.length}
        provinceCount={provinceCount}
        heroSearch={
          <>
            <div className="tm-hero-assistant">
              <AssistantSearchBox surface="yaz" />
            </div>
            <p className="tm-hero-hint">
              Ya da <Link href="/browse">tüm otellere göz atın</Link>.
            </p>
          </>
        }
        afterHero={
          <>
      {/* ── Öne çıkan oteller ────────────────────────────────────────────── */}
      <section className="er-container er-section">
        <div className="er-section-head">
          <div>
            <h2 className="er-display er-h2">Öne çıkan oteller</h2>
            <p className="er-lede" style={{ marginTop: 6 }}>
              {withTour.length > 0
                ? `${published.length} otelin ${withTour.length} tanesinde video tur var; bunlar önce listelenir.`
                : `${published.length} otel yayında.`}
            </p>
          </div>
          <Link
            href="/browse"
            className="er-link"
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            Tümünü gör
            <IconArrowRight size={16} />
          </Link>
        </div>

        {featured.length === 0 ? (
          <div className="er-card" style={{ padding: 32, textAlign: "center" }}>
            <p className="er-muted" style={{ margin: 0 }}>
              Henüz yayında otel yok. Yakında burada olacaklar.
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
                hasTour={Boolean(h.tourId)}
                promotionBadge={h.promotionBadge}
              />
            ))}
          </div>
        )}
      </section>
          </>
        }
      />

      {/* ── Kısayollar: olanak ve şehir ──────────────────────────────────── */}
      {(categories.length > 0 || cities.length > 0) && (
        <section className="er-container er-shortcuts" aria-label="Hızlı arama">
          {categories.length > 0 && (
            <div>
              <h2 className="er-shortcuts-title">Olanağa göre</h2>
              <ul>
                {categories.map((c) => (
                  <li key={c.key}>
                    <Link href={`/browse?amenity=${c.key}`}>
                      <span>{c.label}</span>
                      <span className="er-shortcuts-count">{c.count} otel</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {cities.length > 0 && (
            <div>
              <h2 className="er-shortcuts-title">Şehre göre</h2>
              <ul>
                {cities.map((c) => (
                  <li key={c.label}>
                    <Link href={`/browse?q=${encodeURIComponent(c.query)}`}>
                      <span>{c.label}</span>
                      <span className="er-shortcuts-count">{c.count} otel</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <OwnerBand />
    </div>
  );
}

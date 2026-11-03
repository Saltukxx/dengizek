import type { Metadata } from "next";
import Link from "next/link";
import { IconArrowRight, IconPlayerPlayFilled } from "@tabler/icons-react";
import { Hero, HotelCard } from "@/components/marketing";
import { AssistantSearchBox } from "@/components/guest/assistant-search-box";
import { getPublishedHotelsForBrowse, type BrowseHotelRow } from "@/lib/hotels-repo";
import { amenityLabel, normalizeAmenities } from "@/lib/amenities-catalog";
import { guestShareMeta } from "@/lib/guest-seo";

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

/**
 * Aynı ilin iki yazımı ("Afyon" / "Afyonkarahisar") tek satırda toplanır.
 * Bağlantı kısa yazımı arar; liste araması "içerir" ile çalıştığı için iki
 * yazımı da bulur.
 */
const CITY_ALIASES: Record<string, { label: string; query: string }> = {
  afyon: { label: "Afyonkarahisar", query: "Afyon" },
  afyonkarahisar: { label: "Afyonkarahisar", query: "Afyon" },
};

/** Yayında hiç otel yoksa hero boş kalmasın diye kullanılan yedek görsel. */
const FALLBACK_HERO_IMAGE =
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1600&q=80";

function topCategories(hotels: BrowseHotelRow[]) {
  const counts = new Map<string, number>();
  for (const h of hotels) {
    for (const key of normalizeAmenities(h.amenities)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return CATEGORY_CANDIDATES.map((key) => ({ key, label: amenityLabel(key), count: counts.get(key) ?? 0 }))
    .filter((c) => c.count >= MIN_CATEGORY_COUNT)
    .slice(0, 4);
}

function topCities(hotels: BrowseHotelRow[]) {
  const byCity = new Map<string, { label: string; query: string; count: number }>();
  for (const h of hotels) {
    const city = h.city?.trim();
    if (!city) continue;
    const alias = CITY_ALIASES[city.toLocaleLowerCase("tr-TR")];
    const label = alias?.label ?? city;
    const entry = byCity.get(label) ?? { label, query: alias?.query ?? city, count: 0 };
    entry.count += 1;
    byCity.set(label, entry);
  }
  return [...byCity.values()].sort((a, b) => b.count - a.count).slice(0, 6);
}

export default async function HomePage() {
  const published = await getPublishedHotelsForBrowse({ season: "yaz" });
  const withTour = published.filter((h) => h.tourId);

  // Öne çıkanlar: turu olan oteller önce, kalan yer diğer otellerle dolar.
  const featured = [...withTour, ...published.filter((h) => !h.tourId)].slice(0, 3);
  const showcase = withTour.find((h) => h.imageUrl) ?? published.find((h) => h.imageUrl);
  const heroImage = showcase?.imageUrl ?? FALLBACK_HERO_IMAGE;

  const categories = topCategories(published);
  const cities = topCities(published);

  return (
    <>
      <Hero
        title="Otele gitmeden önce içini gezin"
        description="Lobiden odaya, havuzdan restorana: oteli video turla kendi hızınızda dolaşın, merak ettiğinizi tur sırasında rehbere sorun."
        bgImage={heroImage}
        imageCredit={showcase ? { label: showcase.name, href: `/hotels/${showcase.slug}` } : undefined}
      >
        <div className="er-hero-assistant">
          <AssistantSearchBox />
        </div>
        <p className="er-hero-hint">
          Ya da <Link href="/browse">tüm otellere göz atın</Link>.
        </p>
      </Hero>

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
          <div className="er-card-grid">
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
              />
            ))}
          </div>
        )}
      </section>

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

      {/* ── Video tur nedir ──────────────────────────────────────────────── */}
      {showcase && (
        <section className="er-tour-story">
          <div className="er-container er-tour-story-stage">
            <div>
              <h2 className="er-display er-h2">Fotoğrafta görünmeyeni videoda görün</h2>
              <dl className="er-tour-story-list">
                <div>
                  <dt>Odalar</dt>
                  <dd>Odanın ölçüsünü, manzarasını ve ayrıntılarını videoda görün.</dd>
                </div>
                <div>
                  <dt>Tesis</dt>
                  <dd>Lobiden havuza ve restorana; her durakta yolu siz seçin.</dd>
                </div>
                <div>
                  <dt>Rehber</dt>
                  <dd>Tur sırasında tesisin doğrulanmış bilgileri üzerinden yanıt alın.</dd>
                </div>
              </dl>
            </div>

            <Link
              href={
                showcase.tourId ? `/tours/${showcase.slug}/${showcase.tourId}` : `/hotels/${showcase.slug}`
              }
              className="er-tour-story-preview"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={heroImage} alt="" />
              <span className="er-tour-story-play" aria-hidden>
                <IconPlayerPlayFilled size={22} />
              </span>
              <span className="er-tour-story-caption">
                {showcase.tourId ? `${showcase.name} turunu başlat` : `${showcase.name} sayfasını aç`}
              </span>
            </Link>
          </div>
        </section>
      )}

      {/* ── Otel sahiplerine ─────────────────────────────────────────────── */}
      <section className="er-owner-band">
        <div className="er-container">
          <div>
            <h2 className="er-display er-h2">Otelinizi video turla tanıtın</h2>
            <p>
              Misafirleriniz odayı rezervasyondan önce gezsin. Turu biz kuralım, siz sadece kapıları
              açın.
            </p>
          </div>
          <Link href="/inquiry" className="er-btn er-btn-cta">
            Talep gönderin
          </Link>
        </div>
      </section>
    </>
  );
}

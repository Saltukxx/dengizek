import type { Metadata } from "next";
import Link from "next/link";
import {
  IconBeach,
  IconChevronRight,
  IconSearch,
  IconSparkles,
  IconToolsKitchen2,
  IconWaveSine,
} from "@tabler/icons-react";
import { Hero, HotelCard } from "@/components/marketing";
import { getPublishedHotelsForBrowse } from "@/lib/hotels-repo";

export const metadata: Metadata = {
  title: "Etkileşimli video turlarla otelleri keşfedin",
  description:
    "Seçili otellere göz atın, lobiden odalara adım adım, durdurulabilir video turlarla ilerleyin.",
};

/**
 * Kategori çipleri — her biri keşfet sayfasında gerçek bir olanak filtresine
 * gider. Aday listeden yalnızca yayındaki otellerde gerçekten bulunan
 * olanaklar gösterilir; hiçbiri yoksa çip şeridi çizilmez.
 */
const CATEGORY_CANDIDATES = [
  { key: "ozel-plaj", label: "Deniz & Sahil", Icon: IconWaveSine },
  { key: "spa-merkezi", label: "Lüks Spa", Icon: IconSparkles },
  { key: "restoran", label: "Gastronomi", Icon: IconToolsKitchen2 },
  { key: "acik-havuz", label: "Havuz & Keyif", Icon: IconBeach },
  { key: "her-sey-dahil", label: "Her Şey Dahil", Icon: IconToolsKitchen2 },
  { key: "fitness", label: "Spor & Wellness", Icon: IconSparkles },
] as const;

/** Yayında hiç otel yoksa hero boş kalmasın diye kullanılan yedek görsel. */
const FALLBACK_HERO_IMAGE =
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1600&q=80";

export default async function HomePage() {
  const published = await getPublishedHotelsForBrowse();
  const hotels = published.slice(0, 3);

  // Hero görseli yayındaki ilk görselli otelden gelir — sabit stok görsel değil.
  const heroHotel = published.find((h) => h.imageUrl);
  const heroImage = heroHotel?.imageUrl ?? FALLBACK_HERO_IMAGE;

  // Yayındaki tesislerde gerçekten var olan olanaklar.
  const availableAmenities = new Set(published.flatMap((h) => h.amenities));
  const categories = CATEGORY_CANDIDATES.filter((c) => availableAmenities.has(c.key)).slice(0, 4);

  return (
    <>
      <Hero
        eyebrow="Gitmeden önce gezin"
        title="Hayalindeki tatili keşfet"
        description="Dengizek, otelleri etkileşimli video turlarıyla gösterir. Lobide ve odalarda kendi hızınızda ilerleyin, sorularınızı tur sırasında sorun."
        primaryCta={{ label: "Otelleri Keşfet", href: "/browse" }}
        secondaryCta={{ label: "Özel Tur Planla", href: "/inquiry" }}
        bgImage={heroImage}
        overlapChildren={
          <form method="GET" action="/browse" className="er-search-console">
            <div>
              <label className="er-field-label" htmlFor="q">
                Destinasyon
              </label>
              <div className="er-input-icon">
                <IconSearch size={18} className="er-icon" />
                <input
                  id="q"
                  name="q"
                  className="er-input"
                  placeholder="Nereye gitmek istersiniz?"
                  autoComplete="off"
                />
              </div>
            </div>

            <div>
              <label className="er-field-label" htmlFor="price">
                Bütçe
              </label>
              <select id="price" name="price" className="er-select" defaultValue="">
                <option value="">Fark etmez</option>
                <option value="budget">Ekonomik (&lt; 3.000 ₺)</option>
                <option value="mid">Orta (3.000–8.000 ₺)</option>
                <option value="luxury">Lüks (8.000 ₺+)</option>
              </select>
            </div>

            <div>
              <label className="er-field-label" htmlFor="stars">
                Tesis sınıfı
              </label>
              <select id="stars" name="stars" className="er-select" defaultValue="">
                <option value="">Tüm oteller</option>
                <option value="5">5 yıldız</option>
                <option value="4">4+ yıldız</option>
                <option value="3">3+ yıldız</option>
              </select>
            </div>

            <button type="submit" className="er-btn er-btn-primary">
              <IconSearch size={18} />
              Otelleri Bul
            </button>
          </form>
        }
      />

      {/* ── Kategori çipleri ─────────────────────────────────────────────── */}
      {categories.length > 0 && (
        <section className="er-container" style={{ paddingTop: "clamp(28px, 4vw, 40px)" }}>
          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            {categories.map(({ key, label, Icon }) => (
              <Link key={key} href={`/browse?amenity=${key}`} className="er-pill">
                <Icon size={18} stroke={1.8} style={{ color: "var(--er-primary)" }} />
                {label}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Öne çıkan oteller ────────────────────────────────────────────── */}
      <section className="er-container er-section">
        <div className="er-section-head">
          <div>
            <h2 className="er-display er-h2">Seçkin Destinasyonlar</h2>
            <p className="er-lede" style={{ marginTop: 6 }}>
              Video turu yayında olan, özenle seçilmiş konaklama noktaları.
            </p>
          </div>
          <Link href="/browse" className="er-link" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            Tümünü gör
            <IconChevronRight size={16} />
          </Link>
        </div>

        {hotels.length === 0 ? (
          <div className="er-card" style={{ padding: 32, textAlign: "center" }}>
            <p className="er-muted" style={{ margin: 0 }}>
              Henüz yayında otel yok. Yakında burada olacaklar.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))",
              gap: 20,
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
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Otel sahiplerine CTA bandı ───────────────────────────────────── */}
      <section style={{ background: "var(--er-primary-strong)", color: "#fff" }}>
        <div
          className="er-container"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 32,
            flexWrap: "wrap",
            paddingBlock: "clamp(40px, 6vw, 64px)",
          }}
        >
          <div style={{ maxWidth: 520 }}>
            <h2 className="er-display er-h2" style={{ color: "#fff" }}>
              Otelinizi video turla tanıtın
            </h2>
            <p style={{ margin: "12px 0 0", color: "rgba(255,255,255,0.82)", fontSize: 16 }}>
              Misafirleriniz odayı rezervasyondan önce gezsin. Turu biz kuralım,
              siz sadece kapıları açın.
            </p>
          </div>
          <Link href="/inquiry" className="er-btn er-btn-cta">
            Talep Gönder
          </Link>
        </div>
      </section>
    </>
  );
}

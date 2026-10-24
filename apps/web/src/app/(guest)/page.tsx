import type { Metadata } from "next";
import Link from "next/link";
import {
  IconBeach,
  IconBed,
  IconChevronRight,
  IconMessageCircle,
  IconPlayerPlay,
  IconRoute,
  IconSearch,
  IconSparkles,
  IconToolsKitchen2,
  IconWaveSine,
} from "@tabler/icons-react";
import { Hero, HotelCard } from "@/components/marketing";
import { getPublishedHotelsForBrowse } from "@/lib/hotels-repo";
import { guestShareMeta } from "@/lib/guest-seo";

export const metadata: Metadata = guestShareMeta({
  title: "Etkileşimli video turlarla otelleri keşfedin",
  description:
    "Seçili otellere göz atın, lobiden odalara adım adım, durdurulabilir video turlarla ilerleyin.",
});

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

/** Tur hikâyesi adımları — kış sayfasındaki sahnenin yaz karşılığı. */
const TOUR_STEPS = [
  {
    Icon: IconBed,
    number: "01",
    title: "Odaları gezin",
    body: "Odanın ölçüsünü, manzarasını ve ayrıntılarını videoda görün.",
  },
  {
    Icon: IconRoute,
    number: "02",
    title: "Tesisi dolaşın",
    body: "Lobiden havuza ve sahile; her durakta yolu siz seçin.",
  },
  {
    Icon: IconMessageCircle,
    number: "03",
    title: "Rehbere sorun",
    body: "Tur sırasında tesisin doğrulanmış bilgileri üzerinden yanıt alın.",
  },
] as const;

/** Yayında hiç otel yoksa hero boş kalmasın diye kullanılan yedek görsel. */
const FALLBACK_HERO_IMAGE =
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1600&q=80";

export default async function HomePage() {
  const published = await getPublishedHotelsForBrowse({ season: "yaz" });
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
        description="Otelsayfam, otelleri etkileşimli video turlarıyla gösterir. Lobide ve odalarda kendi hızınızda ilerleyin, sorularınızı tur sırasında sorun."
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
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Tur hikâyesi ─────────────────────────────────────────────────── */}
      <section className="er-tour-story">
        <div className="er-container">
          <div className="er-tour-story-stage">
            <div>
              <p className="er-eyebrow" style={{ color: "var(--er-primary)" }}>
                Otelsayfam video turları
              </p>
              <h2 className="er-display er-h2" style={{ marginTop: 8 }}>
                Otel odasını değil, deneyimi görün
              </h2>
              <p className="er-lede" style={{ marginTop: 10, maxWidth: 440 }}>
                Rezervasyon talebinden önce tesisin akışını kendi hızınızda keşfedin.
              </p>
              <Link href="/browse" className="er-btn er-btn-primary" style={{ marginTop: 20 }}>
                <IconPlayerPlay size={18} />
                Turlu Otelleri Gör
              </Link>
            </div>

            <Link href="/browse" className="er-tour-story-preview" aria-label="Video turlu otelleri incele">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={heroImage} alt="" />
              <ol aria-hidden>
                <li data-active="true">Lobi</li>
                <li>Oda</li>
                <li>Havuz</li>
              </ol>
              <span className="er-tour-story-play" aria-hidden>
                <IconPlayerPlay size={22} />
              </span>
            </Link>
          </div>

          <div className="er-tour-story-steps">
            {TOUR_STEPS.map(({ Icon, number, title, body }) => (
              <article key={number} className="er-card">
                <div>
                  <Icon size={20} stroke={1.7} />
                  <span>{number}</span>
                </div>
                <h3 className="er-display">{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
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

import type { Metadata } from "next";
import Link from "next/link";
import {
  IconBed,
  IconChevronRight,
  IconCircleCheck,
  IconMessageCircle,
  IconMountain,
  IconPlayerPlay,
  IconShieldCheck,
  IconSnowflake,
  IconVideo,
} from "@tabler/icons-react";
import { HotelCard } from "@/components/marketing";
import { ViewTracker } from "@/components/guest/analytics-tracker";
import { getPublishedHotelsForBrowse } from "@/lib/hotels-repo";
import { guestShareMeta } from "@/lib/guest-seo";

export const metadata: Metadata = guestShareMeta({
  title: "Kış tatili otelleri",
  description:
    "Kayak merkezlerine yakın kış otellerini, odalara girmeden önce etkileşimli video turlarıyla gezin.",
});

/** Kış vitrini her zaman pist görseli taşır — tesis kartı yazlık fotoğraf olsa bile. */
const WINTER_HERO_IMAGE =
  "https://images.unsplash.com/photo-1605540436563-5bca919ae766?auto=format&fit=crop&w=2400&q=80";

/** Video tur sahnesi: kar manzaralı lobi/lounge stilli. */
const WINTER_TOUR_STILL =
  "https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=1600&q=80";

/** Kapanış çağrısı: akşam pisti — hero kayakçısından ayrı bir durak. */
const WINTER_FINAL_IMAGE =
  "https://images.unsplash.com/photo-1491555103944-7c647fd857e6?auto=format&fit=crop&w=1800&q=80";

export default async function WinterHomePage() {
  const published = await getPublishedHotelsForBrowse({ season: "kis" });
  const hotels = published.slice(0, 3);

  return (
    <div className="er-winter-home">
      <ViewTracker eventType="page_view" payload={{ page: "kis-home", season: "kis" }} />

      <section className="er-winter-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="er-winter-hero-photo"
          src={WINTER_HERO_IMAGE}
          alt="Pistte kayakçı"
        />
        <div className="er-winter-hero-shade" />
        <div className="er-container er-winter-hero-inner">
          <div className="er-winter-hero-copy">
            <p className="er-eyebrow">Kar sezonu seçkisi</p>
            <h1 className="er-display">Kışı, gitmeden önce yaşayın.</h1>
            <p>
              Kayak otellerini odasından pistine kadar etkileşimli video turlarla keşfedin.
            </p>
          </div>
          <div className="er-winter-search">
            <form method="GET" action="/kis/oteller" className="er-search-console">
              <div className="er-winter-field">
                <label className="er-field-label" htmlFor="q">
                  Kayak merkezi
                </label>
                <input
                  id="q"
                  name="q"
                  className="er-input"
                  placeholder="Uludağ, Palandöken…"
                  autoComplete="off"
                />
              </div>

              <div className="er-winter-field">
                <label className="er-field-label" htmlFor="price">
                  Gecelik bütçe
                </label>
                <select id="price" name="price" className="er-select" defaultValue="">
                  <option value="">Fark etmez</option>
                  <option value="budget">Ekonomik (&lt; 3.000 ₺)</option>
                  <option value="mid">Orta (3.000–8.000 ₺)</option>
                  <option value="luxury">Lüks (8.000 ₺+)</option>
                </select>
              </div>

              <div className="er-winter-field">
                <label className="er-field-label" htmlFor="stars">
                  Otel sınıfı
                </label>
                <select id="stars" name="stars" className="er-select" defaultValue="">
                  <option value="">Tüm oteller</option>
                  <option value="5">5 yıldız</option>
                  <option value="4">4+ yıldız</option>
                  <option value="3">3+ yıldız</option>
                </select>
              </div>

              <button type="submit" className="er-btn er-btn-cta">
                Kış Otellerini Bul
              </button>
            </form>
          </div>
          <div className="er-winter-trust" aria-label="Dengizek güvenceleri">
            <span><IconShieldCheck size={18} /> Doğrulanmış tesis</span>
            <span><IconVideo size={18} /> Gerçek video turu</span>
            <span><IconCircleCheck size={18} /> Doğrudan talep</span>
          </div>
        </div>
      </section>

      <section className="er-container er-section er-winter-featured">
        <div className="er-winter-section-head">
          <div>
            <p className="er-eyebrow">Kış koleksiyonu</p>
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
                href={`/kis/oteller/${h.slug}`}
                actionLabel="Tesisi İncele"
              />
            ))}
          </div>
        )}
      </section>

      <section className="er-winter-experience">
        <div className="er-container">
          <div className="er-winter-experience-stage">
            <div className="er-winter-experience-head">
              <p className="er-eyebrow">Dengizek video turları</p>
              <h2 className="er-display er-h2">Otel odasını değil, deneyimi görün</h2>
              <p>Rezervasyon talebinden önce tesisin akışını kendi hızınızda keşfedin.</p>
            </div>

            <Link
              href="/kis/oteller"
              className="er-winter-tour-preview"
              aria-label="Video tur örneğini incele"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="er-winter-tour-preview-photo"
                src={WINTER_TOUR_STILL}
                alt="Kar manzaralı lobide video tur durakları"
              />
              <div className="er-winter-tour-preview-shade" />
              <ol className="er-winter-tour-preview-stops" aria-hidden>
                <li>Oda</li>
                <li data-active="true">Lobi</li>
                <li>Pist</li>
              </ol>
              <span className="er-winter-tour-preview-play" aria-hidden>
                <IconPlayerPlay size={20} />
              </span>
              <div className="er-winter-tour-preview-meta" aria-hidden>
                <p>
                  <span>Durak 02 / 06</span>
                  Şömineli lobi
                </p>
                <div className="er-winter-tour-preview-bar" aria-hidden>
                  <span />
                </div>
              </div>
            </Link>
          </div>

          <div className="er-winter-steps">
            {(
              [
                {
                  Icon: IconBed,
                  number: "01",
                  title: "Odaları gezin",
                  body: "Odanın ölçüsünü, manzarasını ve ayrıntılarını videoda görün.",
                },
                {
                  Icon: IconMountain,
                  number: "02",
                  title: "Piste geçişi anlayın",
                  body: "Lobiden kayak odasına ve pist yönüne kadar rotayı takip edin.",
                },
                {
                  Icon: IconMessageCircle,
                  number: "03",
                  title: "Rehbere sorun",
                  body: "Tur sırasında tesisin doğrulanmış bilgileri üzerinden yanıt alın.",
                },
              ] as const
            ).map((step) => {
              const Icon = step.Icon;
              return (
                <article key={step.number} className="er-winter-step">
                  <div className="er-winter-step-top">
                    <span className="er-winter-step-icon" aria-hidden>
                      <Icon size={16} />
                    </span>
                    <span>{step.number}</span>
                  </div>
                  <h3 className="er-display">{step.title}</h3>
                  <p>{step.body}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="er-winter-final">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="er-winter-final-photo"
          src={WINTER_FINAL_IMAGE}
          alt=""
        />
        <div className="er-winter-final-shade" />
        <div className="er-container er-winter-final-inner">
          <p className="er-eyebrow">Tur hazır</p>
          <h2 className="er-display er-h2">Piste çıkmadan otelinizi gezin</h2>
          <p>Şömineli lobiden spa’ya, odadan kayak alanına kadar her bölümü görün.</p>
          <Link href="/kis/oteller" className="er-btn er-btn-cta">
            Turu Başlat
          </Link>
        </div>
      </section>

      <section className="er-winter-owner">
        <div className="er-container">
          <div>
            <h2 className="er-display er-h2">Kayak otelinizi video turla tanıtın</h2>
            <p>Misafirler pist mesafesini ve otel atmosferini kendi gözleriyle görsün.</p>
          </div>
          <Link href="/kis/talep" className="er-btn er-btn-cta">
            Otelini Ekle
          </Link>
        </div>
      </section>
    </div>
  );
}

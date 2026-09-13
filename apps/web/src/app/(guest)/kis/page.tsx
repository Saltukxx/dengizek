import type { Metadata } from "next";
import Link from "next/link";
import {
  IconArrowRight,
  IconChevronRight,
  IconCircleCheck,
  IconPlayerPlay,
  IconSearch,
  IconShieldCheck,
  IconSnowflake,
  IconVideo,
} from "@tabler/icons-react";
import { HotelCard } from "@/components/marketing";
import { ViewTracker } from "@/components/guest/analytics-tracker";
import { getPublishedHotelsForBrowse } from "@/lib/hotels-repo";

export const metadata: Metadata = {
  title: "Kış tatili otelleri",
  description:
    "Kayak merkezlerine yakın kış otellerini, odalara girmeden önce etkileşimli video turlarıyla gezin.",
};

/** Yayında kış oteli yoksa hero boş kalmasın. */
const FALLBACK_HERO_IMAGE =
  "https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=1600&q=80";

export default async function WinterHomePage() {
  const published = await getPublishedHotelsForBrowse({ season: "kis" });
  const hotels = published.slice(0, 3);

  const heroHotel = published.find((h) => h.imageUrl);
  const heroImage = heroHotel?.imageUrl ?? FALLBACK_HERO_IMAGE;

  return (
    <div className="er-winter-home">
      <ViewTracker eventType="page_view" payload={{ page: "kis-home", season: "kis" }} />

      <section className="er-winter-hero" style={{ backgroundImage: `url(${heroImage})` }}>
        <div className="er-winter-hero-shade" />
        <div className="er-container er-winter-hero-inner">
          <div className="er-winter-hero-copy">
            <p className="er-eyebrow">Kar sezonu seçkisi</p>
            <h1 className="er-display">Kışı, gitmeden önce yaşayın.</h1>
            <p>
              Kayak otellerini odasından pistine kadar etkileşimli video turlarla keşfedin.
            </p>
          </div>
          <form method="GET" action="/kis/oteller" className="er-search-console">
            <div>
              <label className="er-field-label" htmlFor="q">
                Kayak merkezi
              </label>
              <div className="er-input-icon">
                <IconSearch size={18} className="er-icon" />
                <input
                  id="q"
                  name="q"
                  className="er-input"
                  placeholder="Uludağ, Palandöken, Erciyes…"
                  autoComplete="off"
                />
              </div>
            </div>

            <div>
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

            <div>
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

            <button type="submit" className="er-btn er-btn-primary">
              <IconSearch size={18} />
              Kış Otellerini Bul
            </button>
          </form>
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
              size={32}
              stroke={1.5}
              style={{ color: "var(--er-primary)", marginBottom: 12 }}
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
                href={`/kis/oteller/${h.slug}`}
                actionLabel="Tesisi İncele"
              />
            ))}
          </div>
        )}
      </section>

      <section className="er-container er-section er-winter-experience">
        <div className="er-winter-experience-head">
          <p className="er-eyebrow">Dengizek video turları</p>
          <h2 className="er-display er-h2">Otel odasını değil, deneyimi görün</h2>
          <p>Rezervasyon talebinden önce tesisin akışını kendi hızınızda keşfedin.</p>
        </div>
        <div className="er-winter-steps">
          {[
            ["01", "Odaları gezin", "Odanın ölçüsünü, manzarasını ve ayrıntılarını videoda görün."],
            ["02", "Piste geçişi anlayın", "Lobiden kayak odasına ve pist yönüne kadar rotayı takip edin."],
            ["03", "Rehbere sorun", "Tur sırasında tesisin doğrulanmış bilgileri üzerinden yanıt alın."],
          ].map(([number, title, body]) => (
            <article key={number} className="er-winter-step">
              <span>{number}</span>
              <h3 className="er-display">{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="er-container er-winter-final">
        <div>
          <p className="er-eyebrow">Tur hazır</p>
          <h2 className="er-display er-h2">Piste çıkmadan otelinizi gezin</h2>
          <p>Şömineli lobiden spa’ya, odadan kayak alanına kadar her bölümü görün.</p>
        </div>
        <Link href="/kis/oteller" className="er-btn er-btn-cta">
          <IconPlayerPlay size={18} />
          Turu Başlat
          <IconArrowRight size={18} />
        </Link>
      </section>

      <section className="er-winter-owner">
        <div className="er-container">
          <div>
            <h2 className="er-display er-h2">Kayak otelinizi video turla tanıtın</h2>
            <p>Misafirler pist mesafesini ve otel atmosferini kendi gözleriyle görsün.</p>
          </div>
          <Link href="/inquiry" className="er-btn er-btn-cta">
            Otelini Ekle <IconChevronRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  );
}

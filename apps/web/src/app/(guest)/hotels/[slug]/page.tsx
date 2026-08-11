/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  IconBarbell,
  IconBeach,
  IconBellRinging,
  IconCar,
  IconChevronRight,
  IconCircleCheck,
  IconMapPin,
  IconMessageCircle,
  IconPaw,
  IconPool,
  IconSnowflake,
  IconSoup,
  IconSparkles,
  IconStarFilled,
  IconToolsKitchen2,
  IconView360,
  IconWifi,
} from "@tabler/icons-react";
import {
  getPublishedHotelBySlug,
  getPublishedHotelContent,
  getPublishedReviews,
  getPublishedTours,
} from "@/lib/hotels-repo";
import { ViewTracker } from "@/components/guest/analytics-tracker";
import { AmenitiesSection } from "@/components/guest/amenities-section";
import { AvailabilitySection } from "@/components/guest/availability-section";
import { ExtrasSection } from "@/components/guest/extras-section";
import { GallerySection } from "@/components/guest/gallery-section";
import { HotelMapSection } from "@/components/guest/hotel-map-section";
import { PoliciesSection } from "@/components/guest/policies-section";
import { RestaurantsSection } from "@/components/guest/restaurants-section";
import { RoomsSection } from "@/components/guest/rooms-section";
import { ReviewsSection } from "@/components/guest/reviews-section";
import { amenityLabel } from "@/lib/amenities-catalog";
import { resolveGuestRoomPrice } from "@/lib/guest-pricing";
import { formatPrice } from "@/lib/price";

type PageProps = { params: Promise<{ slug: string }> };

/** Öne çıkan olanak kutuları için ikon eşlemesi — eşleşmeyen anahtar için varsayılan. */
const AMENITY_ICONS: Record<string, typeof IconPool> = {
  "acik-havuz": IconPool,
  "kapali-havuz": IconPool,
  "cocuk-havuzu": IconPool,
  "ozel-plaj": IconBeach,
  "plaj-bari": IconBeach,
  "spa-merkezi": IconSparkles,
  hamam: IconSparkles,
  sauna: IconSparkles,
  masaj: IconSparkles,
  fitness: IconBarbell,
  restoran: IconToolsKitchen2,
  bar: IconSoup,
  "kahvalti-dahil": IconToolsKitchen2,
  "her-sey-dahil": IconToolsKitchen2,
  "oda-servisi": IconToolsKitchen2,
  "ucretsiz-wifi": IconWifi,
  klima: IconSnowflake,
  "resepsiyon-7-24": IconBellRinging,
  concierge: IconBellRinging,
  otopark: IconCar,
  vale: IconCar,
  "evcil-hayvan": IconPaw,
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const hotel = await getPublishedHotelBySlug(slug);
  if (!hotel) return { title: "Otel" };
  return {
    title: hotel.name,
    description: hotel.shortDescription,
  };
}

export default async function HotelPage({ params }: PageProps) {
  const { slug } = await params;
  const hotel = await getPublishedHotelBySlug(slug);
  if (!hotel) notFound();

  const [content, reviews, tours] = await Promise.all([
    getPublishedHotelContent(slug),
    getPublishedReviews(slug),
    getPublishedTours(slug),
  ]);

  // Otelin genel turu (oda turu olmayan ilk tur); yoksa ilk tur.
  const featuredTour = tours.find((t) => t.roomSlug == null) ?? tours[0];

  // Galeri ızgarası: kapak görseli + panelden gelen görsellerin ilk birkaçı.
  const galleryImages = [
    ...(hotel.imageUrl ? [{ url: hotel.imageUrl, caption: hotel.name }] : []),
    ...content.gallery,
  ];
  const gridImages = galleryImages.slice(0, 5);

  const stars = content.specs.starRating;
  const featuredAmenities = content.amenities.slice(0, 4);

  // Panelde gösterilecek "başlayan" fiyat, oda kartlarıyla AYNI motordan
  // geçer: dönemsel fiyat, rate plan ve promosyon indirimleri dahil.
  // (Ham room.priceMinor okumak panelde indirimsiz fiyat gösteriyordu.)
  const pricedRooms = content.rooms.map((room) =>
    resolveGuestRoomPrice({
      room: {
        id: room.id,
        priceMinor: room.priceMinor,
        currency: room.currency,
        priceOnRequest: room.priceOnRequest,
        discountPercent: room.discountPercent,
        discountLabel: room.discountLabel,
        minStayNights: room.minStayNights,
      },
      rates: room.rates,
      promotions: content.promotions,
      ratePlanPrices: content.ratePlanPrices,
    }),
  );
  const cheapest = pricedRooms
    .filter((p) => !p.priceOnRequest && p.priceMinor != null && p.priceMinor > 0)
    .sort((a, b) => (a.priceMinor as number) - (b.priceMinor as number))[0];
  const fromPrice = cheapest?.priceMinor ?? null;
  const fromOriginalPrice =
    cheapest?.originalPriceMinor != null && cheapest.originalPriceMinor > (fromPrice ?? 0)
      ? cheapest.originalPriceMinor
      : null;
  const currency = cheapest?.currency ?? content.rooms.find((r) => r.currency)?.currency ?? "TRY";

  return (
    <div className="er-container" style={{ paddingBlock: "clamp(20px, 3vw, 32px)" }}>
      {/* Otel görüntüleme olayı — panel analitiğinin huni girişi */}
      <ViewTracker
        eventType="hotel_view"
        hotelSlug={slug}
        payload={{ hasTour: Boolean(featuredTour), roomCount: content.rooms.length }}
      />

      {/* ── Başlık ────────────────────────────────────────────────────────── */}
      <nav
        aria-label="Sayfa yolu"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--er-text-dim)",
          marginBottom: 10,
        }}
      >
        <Link href="/browse" style={{ color: "var(--er-primary)" }}>
          Oteller
        </Link>
        <IconChevronRight size={13} />
        <span>{[hotel.city, hotel.country].filter(Boolean).join(", ")}</span>
      </nav>

      <div style={{ marginBottom: 20 }}>
        <h1 className="er-display er-h1">{hotel.name}</h1>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
            marginTop: 10,
          }}
        >
          {stars ? (
            <span style={{ display: "inline-flex", gap: 2 }} aria-label={`${stars} yıldız`}>
              {Array.from({ length: stars }).map((_, i) => (
                <IconStarFilled key={i} size={16} style={{ color: "var(--er-cta)" }} />
              ))}
            </span>
          ) : null}
          {reviews.count > 0 && reviews.average != null && (
            <span style={{ fontSize: 14, color: "var(--er-text-muted)" }}>
              <strong style={{ color: "var(--er-primary)" }}>
                {reviews.average.toLocaleString("tr-TR", { minimumFractionDigits: 1 })}
              </strong>{" "}
              ({reviews.count} değerlendirme)
            </span>
          )}
          {content.specs.address && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 14,
                color: "var(--er-text-muted)",
              }}
            >
              <IconMapPin size={15} stroke={1.8} />
              {content.specs.address}
            </span>
          )}
        </div>
      </div>

      {/* ── Galeri ızgarası ───────────────────────────────────────────────── */}
      {gridImages.length > 0 && (
        <div
          className="er-gallery"
          data-count={gridImages.length}
          style={{ marginBottom: "clamp(24px, 3vw, 40px)" }}
        >
          {gridImages.map((img, i) => (
            <div key={img.url + i}>
              <img src={img.url} alt={img.caption ?? hotel.name} />
              {i === gridImages.length - 1 && galleryImages.length > gridImages.length && (
                <span
                  className="er-rating-badge"
                  style={{ position: "absolute", right: 12, bottom: 12 }}
                >
                  +{galleryImages.length - gridImages.length} fotoğraf
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── İçerik + rezervasyon paneli ───────────────────────────────────── */}
      <div className="er-detail-grid">
        <div>
          <section>
            <h2 className="er-display er-h2">Bu tesis hakkında</h2>
            <p className="er-lede" style={{ marginTop: 12 }}>
              {hotel.longDescription || hotel.shortDescription}
            </p>

            {featuredAmenities.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 12,
                  marginTop: 24,
                }}
              >
                {featuredAmenities.map((key) => {
                  const Icon = AMENITY_ICONS[key] ?? IconCircleCheck;
                  return (
                    <div key={key} className="er-feature-box">
                      <Icon size={26} stroke={1.6} />
                      {amenityLabel(key)}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <RoomsSection
            hotelSlug={slug}
            rooms={content.rooms}
            promotions={content.promotions}
            ratePlanPrices={content.ratePlanPrices}
          />
          <AvailabilitySection
            hotelSlug={slug}
            notes={content.availabilityNotes}
            blackoutText={content.specs.blackoutText}
          />
          <AmenitiesSection amenities={content.amenities} specs={content.specs} />
          <RestaurantsSection restaurants={content.restaurants} />
          <ExtrasSection extras={content.extras} />
          <GallerySection images={content.gallery} />
          <HotelMapSection
            latitude={content.latitude}
            longitude={content.longitude}
            address={content.specs.address}
            hotelName={hotel.name}
          />
          <PoliciesSection specs={content.specs} />
          <ReviewsSection summary={reviews} />
        </div>

        {/* ── Yapışkan panel ──────────────────────────────────────────────── */}
        <aside className="er-booking-panel">
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            {fromOriginalPrice != null && (
              <span
                className="er-price-note"
                style={{ textDecoration: "line-through", order: -1, width: "100%" }}
              >
                {formatPrice(fromOriginalPrice, currency)}
              </span>
            )}
            <span className="er-price" style={{ fontSize: 30 }}>
              {fromPrice != null ? formatPrice(fromPrice, currency) : "Talep üzerine"}
            </span>
            {fromPrice != null && <span className="er-price-note">/ gece</span>}
            {cheapest?.discountLabel && (
              <span
                className="er-chip"
                style={{ background: "var(--er-cta-tint)", color: "var(--er-cta)" }}
              >
                {cheapest.discountLabel}
              </span>
            )}
          </div>

          {content.specs.checkInTime && content.specs.checkOutTime && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div
                style={{
                  border: "1px solid var(--er-line)",
                  borderRadius: "var(--er-radius)",
                  padding: "10px 12px",
                }}
              >
                <div className="er-field-label" style={{ marginBottom: 2 }}>
                  Giriş
                </div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{content.specs.checkInTime}</div>
              </div>
              <div
                style={{
                  border: "1px solid var(--er-line)",
                  borderRadius: "var(--er-radius)",
                  padding: "10px 12px",
                }}
              >
                <div className="er-field-label" style={{ marginBottom: 2 }}>
                  Çıkış
                </div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{content.specs.checkOutTime}</div>
              </div>
            </div>
          )}

          <Link href={`/inquiry?hotel=${slug}`} className="er-btn er-btn-cta er-btn-block">
            Rezervasyon Talebi Gönder
          </Link>

          {featuredTour && (
            <Link
              href={`/tours/${slug}/${featuredTour.tourId}`}
              className="er-btn er-btn-primary er-btn-block"
            >
              <IconView360 size={20} />
              Sanal Turu Başlat
            </Link>
          )}

          <p style={{ margin: 0, textAlign: "center", fontSize: 12, color: "var(--er-text-dim)" }}>
            Şu anda ücret alınmaz — talebiniz tesise iletilir.
          </p>

          {tours.length > 1 && (
            <div style={{ borderTop: "1px solid var(--er-line)", paddingTop: 14 }}>
              <p className="er-field-label">Diğer turlar</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {tours.slice(0, 4).map((t) => (
                  <Link
                    key={t.tourId}
                    href={`/tours/${slug}/${t.tourId}`}
                    className="er-link"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <IconView360 size={16} />
                    {t.title ?? t.tourId}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              padding: 14,
              borderRadius: "var(--er-radius)",
              background: "var(--er-primary-tint)",
            }}
          >
            <IconMessageCircle
              size={20}
              stroke={1.8}
              style={{ color: "var(--er-primary)", flexShrink: 0, marginTop: 2 }}
            />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--er-primary)" }}>
                Sorunuz mu var?
              </div>
              <div style={{ fontSize: 13, color: "var(--er-text-muted)" }}>
                Tur sırasında dijital asistana sorabilir ya da talep formundan bize
                yazabilirsiniz.
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

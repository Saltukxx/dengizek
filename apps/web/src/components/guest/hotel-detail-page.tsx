import Image from "next/image";
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
  IconRosetteDiscount,
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
  getHotelIdBySlug,
  getPublishedHotelBySlug,
  getPublishedHotelContent,
  getPublishedHotelsForBrowse,
  getPublishedReviews,
  getPublishedTours,
  matchesSeason,
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
import { guestShareMeta } from "@/lib/guest-seo";
import { guestPaths, type GuestSurface } from "@/lib/guest-surface";
import { ReviewsSection } from "@/components/guest/reviews-section";
import { amenityLabel, highlightAmenityKeys } from "@/lib/amenities-catalog";
import { HotelChat, OpenHotelChatButton } from "@/components/guest/hotel-chat";
import { StayCalculator, StayLink } from "@/components/guest/stay-calculator";
import { PromotionsSection } from "@/components/guest/promotions-section";
import { bestPromotionBadge } from "@/lib/promotion-display";
import { todayIso } from "@/lib/price";
import { HotelCard } from "@/components/marketing";
import { hotelContactLinks } from "@/lib/contact-phone";
import { boardTypeLabels } from "@/lib/schemas/hotel-content";
import { pickSimilarHotels } from "@/lib/similar-hotels";
import type { QuotePricing } from "@/lib/stay-search";
import { PageBanner } from "@/components/guest/page-banner";
import { GalleryRail } from "@/components/guest/gallery-rail";
import { HotelStickyBar } from "@/components/guest/hotel-sticky-bar";
import { hotelChatStarters } from "@/lib/ai/hotel-page-chat";
import { resolveGuestRoomPrice } from "@/lib/guest-pricing";
import { formatPrice } from "@/lib/price";

export type HotelDetailSurface = GuestSurface;

/** Stop sale / dolu / CTA-CTD kısıtları — okunamazsa hesaplayıcı kısıtsız çalışır. */
async function loadGuestRestrictions(hotelId: string | null) {
  if (!hotelId) return {};
  try {
    const [{ loadStayRestrictions }, { todayIso }] = await Promise.all([import("@/lib/stay-restrictions"), import("@/lib/price")]);
    const today = todayIso();
    const horizon = new Date(`${today}T12:00:00.000Z`);
    horizon.setUTCDate(horizon.getUTCDate() + 548);
    return await loadStayRestrictions(hotelId, today, horizon.toISOString().slice(0, 10));
  } catch {
    return {};
  }
}
export type HotelDetailPageProps = {
  params: Promise<{ slug: string }>;
  surface?: HotelDetailSurface;
};

/** Öne çıkan olanak kutuları için ikon eşlemesi — eşleşmeyen anahtar için varsayılan. */
const AMENITY_ICONS: Record<string, typeof IconPool> = {
  "termal-havuz": IconPool,
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

export async function generateHotelMetadata(
  { params }: HotelDetailPageProps,
  surface: HotelDetailSurface = "yaz",
): Promise<Metadata> {
  const { slug } = await params;
  const hotel = await getPublishedHotelBySlug(slug);
  if (!hotel) return { title: "Otel" };
  if (surface !== "yaz") {
    const content = await getPublishedHotelContent(slug);
    if (!matchesSeason(content.specs.seasons, surface)) return { title: "Otel" };
  }
  return guestShareMeta({
    title: hotel.name,
    description: hotel.shortDescription ?? undefined,
    imageUrl: hotel.imageUrl,
  });
}

/** Bu uzunluğu aşan açıklama ilk cümle sınırında bölünür, kalanı açılır. */
const DESCRIPTION_PREVIEW_CHARS = 280;

function HotelDescription({ text }: { text: string }) {
  if (!text) return null;
  const cut = text.length > DESCRIPTION_PREVIEW_CHARS ? text.indexOf(". ", DESCRIPTION_PREVIEW_CHARS) : -1;
  if (cut === -1) {
    return (
      <p className="er-lede" style={{ marginTop: 12 }}>
        {text}
      </p>
    );
  }
  return (
    <div style={{ marginTop: 12 }}>
      <p className="er-lede">{text.slice(0, cut + 1)}</p>
      <details className="er-description-more">
        <summary>Devamını oku</summary>
        <p className="er-lede" style={{ marginTop: 12 }}>
          {text.slice(cut + 2)}
        </p>
      </details>
    </div>
  );
}

export async function HotelDetailPage({ params, surface = "yaz" }: HotelDetailPageProps) {
  const { slug } = await params;
  const hotel = await getPublishedHotelBySlug(slug);
  if (!hotel) notFound();

  const [content, reviews, tours, surfaceHotels] = await Promise.all([
    getPublishedHotelContent(slug),
    getPublishedReviews(slug),
    getPublishedTours(slug),
    getPublishedHotelsForBrowse({ season: surface }),
  ]);

  const isWinter = surface === "kis";
  // Kış ve termal detay rotaları da vitrinle aynı korumaya tabidir. Sezonu boş
  // eski tesisler yaz detayında çalışmaya devam eder, sezon rotasında 404 olur.
  if (surface !== "yaz" && !matchesSeason(content.specs.seasons, surface)) notFound();

  const paths = guestPaths(surface);
  const browseHref = paths.browse;
  const tourHref = (tourId: string) => paths.tour(slug, tourId);

  // Otelin genel turu (oda turu olmayan ilk tur); yoksa ilk tur.
  const featuredTour = tours.find((t) => t.roomSlug == null) ?? tours[0];

  // Galeri ızgarası: kapak görseli + panelden gelen görsellerin ilk birkaçı.
  const galleryImages = [
    ...(hotel.imageUrl ? [{ url: hotel.imageUrl, caption: hotel.name }] : []),
    ...content.gallery,
  ];
  const gridImages = galleryImages.slice(0, 5);

  const stars = content.specs.starRating;
  const featuredAmenities = highlightAmenityKeys(content.amenities, 4);

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

  const location = [hotel.city, hotel.country].filter(Boolean).join(", ");

  // Fiyat hesaplayıcı istemcide çalışır; yalnız fiyat için gereken alanlar iner.
  const quotePricing: QuotePricing = {
    rooms: content.rooms.map((room) => ({
      id: room.id,
      slug: room.slug,
      name: room.name,
      imageUrl: room.imageUrl ?? null,
      boardType: room.boardType ?? null,
      capacityAdults: room.capacityAdults ?? null,
      capacityChildren: room.capacityChildren ?? null,
      priceMinor: room.priceMinor ?? null,
      currency: room.currency,
      priceOnRequest: room.priceOnRequest,
      discountPercent: room.discountPercent ?? null,
      discountLabel: room.discountLabel ?? null,
      minStayNights: room.minStayNights ?? null,
      childAgePrices: room.childAgePrices ?? null,
      rates: room.rates.map((rate) => ({
        name: rate.name,
        startDate: String(rate.startDate),
        endDate: String(rate.endDate),
        priceMinor: rate.priceMinor,
        currency: rate.currency,
        minStayNights: rate.minStayNights,
        occupancyPrices: rate.occupancyPrices ?? undefined,
        childAgePrices: rate.childAgePrices ?? undefined,
        weekdays: rate.weekdays ?? null,
        stayMinNights: rate.stayMinNights ?? null,
        stayMaxNights: rate.stayMaxNights ?? null,
      })),
    })),
    promotions: content.promotions,
    ratePlanPrices: content.ratePlanPrices,
    closedRanges: content.availabilityNotes
      .filter((note) => note.isBlackout && note.startDate)
      .map((note) => ({ startDate: note.startDate, endDate: note.endDate })),
    restrictions: await loadGuestRestrictions(await getHotelIdBySlug(slug)),
  };
  const boardLabels = Object.fromEntries(
    content.rooms
      .filter((room) => room.boardType && room.boardType !== "sadece-oda")
      .map((room) => [room.slug, boardTypeLabels[room.boardType as keyof typeof boardTypeLabels] ?? String(room.boardType)]),
  );

  const contact = hotelContactLinks(
    { phone: content.specs.publicPhone ?? null, whatsapp: content.specs.whatsappPhone ?? null },
    hotel.name,
  );
  const similar = pickSimilarHotels(surfaceHotels, slug);
  const today = todayIso();
  const roomNames = Object.fromEntries(content.rooms.map((room) => [room.id, room.name]));
  const promoBadge = bestPromotionBadge(content.promotions, today);

  return (
    <>
      <PageBanner
        overlap={gridImages.length > 0}
        before={
          <nav aria-label="Sayfa yolu" className="pb-crumbs">
            <Link href={browseHref}>Oteller</Link>
            <IconChevronRight size={13} aria-hidden />
            <span>{location}</span>
          </nav>
        }
        title={hotel.name}
      >
        <div className="pb-meta">
          {stars ? (
            <span className="pb-stars" aria-label={`${stars} yıldız`}>
              {Array.from({ length: stars }).map((_, i) => (
                <IconStarFilled key={i} size={16} />
              ))}
            </span>
          ) : null}
          {reviews.count > 0 && reviews.average != null && (
            <span>
              <strong>{reviews.average.toLocaleString("tr-TR", { minimumFractionDigits: 1 })}</strong> (
              {reviews.count} değerlendirme)
            </span>
          )}
          {content.specs.address && (
            <span className="pb-meta-item">
              <IconMapPin size={15} stroke={1.8} aria-hidden />
              {content.specs.address}
            </span>
          )}
        </div>
      </PageBanner>
    <div
      className={`er-container${isWinter ? " er-winter-detail" : surface === "termal" ? " er-thermal-detail" : ""}`}
      style={{ paddingBlock: gridImages.length > 0 ? "0 clamp(20px, 3vw, 32px)" : "clamp(20px, 3vw, 32px)" }}
    >
      {/* Otel görüntüleme olayı — panel analitiğinin huni girişi */}
      <ViewTracker
        eventType="hotel_view"
        hotelSlug={slug}
        payload={{ hasTour: Boolean(featuredTour), roomCount: content.rooms.length }}
      />

        <GalleryRail images={galleryImages.map((img) => ({ url: img.url, caption: img.caption }))} name={hotel.name} />

        {/* ── Galeri ızgarası ─────────────────────────────────────────────── */}
        {gridImages.length > 0 && (
          <div
            className="er-gallery pb-lift"
            data-count={gridImages.length}
            style={{ marginBottom: "clamp(24px, 3vw, 40px)" }}
          >
            {gridImages.map((img, i) => (
              <div key={img.url + i}>
                <Image
                  src={img.url}
                  alt={img.caption ?? hotel.name}
                  fill
                  priority={i === 0}
                  sizes={i === 0 ? "(max-width: 768px) 100vw, 640px" : "(max-width: 768px) 50vw, 320px"}
                  style={{ objectFit: "cover" }}
                />
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
          <PromotionsSection promotions={content.promotions} roomNames={roomNames} today={today} />
          {content.rooms.length > 0 && (
            <StayCalculator
              pricing={quotePricing}
              boardLabels={boardLabels}
              inquiryPath={paths.inquiry}
              hotelSlug={slug}
            />
          )}

          <section>
            <h2 className="er-display er-h2">Bu tesis hakkında</h2>
            <HotelDescription text={hotel.longDescription || hotel.shortDescription || ""} />

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
            surface={surface}
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
            {fromPrice != null ? (
              <>
                <span className="er-price" style={{ fontSize: 30 }}>
                  {formatPrice(fromPrice, currency)}
                </span>
                <span className="er-price-note">/ gece</span>
              </>
            ) : (
              <span className="er-price-note">Fiyat talep üzerine</span>
            )}
            {cheapest?.discountLabel && (
              <span
                className="er-chip"
                style={{ background: "var(--er-cta-tint)", color: "var(--er-cta)" }}
              >
                {cheapest.discountLabel}
              </span>
            )}
          </div>

          {promoBadge && (
            <p className="er-panel-promo">
              <IconRosetteDiscount size={16} aria-hidden /> Kampanya: {promoBadge}
            </p>
          )}

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

          <StayLink href={`${paths.inquiry}?hotel=${slug}`} className="er-btn er-btn-cta er-btn-block">
            Rezervasyon Talebi Gönder
          </StayLink>

          {featuredTour && (
            <Link
              href={tourHref(featuredTour.tourId)}
              className="er-btn er-btn-primary er-btn-block"
            >
              <IconView360 size={20} />
              Video turu başlat
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
                    href={tourHref(t.tourId)}
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

          <OpenHotelChatButton className="er-chat-inline">
            <IconMessageCircle size={20} stroke={1.8} aria-hidden />
            <span>
              <strong>Sorunuz mu var?</strong>
              <span>Rehbere sorun; otelin bilgilerinden hemen cevaplasın.</span>
            </span>
          </OpenHotelChatButton>
        </aside>
      </div>

      <HotelStickyBar
        priceText={fromPrice != null ? `${formatPrice(fromPrice, currency)} / gece` : "Fiyat talep üzerine"}
        inquiryHref={`${paths.inquiry}?hotel=${slug}`}
      />

      {similar.length > 0 && (
        <section className="er-similar" aria-labelledby="benzer-oteller">
          <div className="er-section-head">
            <h2 id="benzer-oteller" className="er-display er-h2">
              Benzer oteller
            </h2>
            <Link
              href={browseHref}
              className="er-link"
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              Tümünü gör
              <IconChevronRight size={16} />
            </Link>
          </div>
          <div className="er-card-grid er-card-grid-4 mobile-rail">
            {similar.map((h) => (
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
                href={paths.hotel(h.slug)}
                sizes="(max-width: 640px) 80vw, (max-width: 1280px) 25vw, 300px"
              />
            ))}
          </div>
        </section>
      )}

      <HotelChat
        actions={{
          tourHref: featuredTour ? tourHref(featuredTour.tourId) : null,
          tel: contact.tel,
          whatsapp: contact.whatsapp,
        }}
        hotelSlug={slug}
        hotelName={hotel.name}
        inquiryPath={paths.inquiry}
        starterQuestions={hotelChatStarters(content)}
      />
    </div>
    </>
  );
}

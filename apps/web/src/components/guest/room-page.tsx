import Image from "next/image";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  IconBed,
  IconChevronRight,
  IconEye,
  IconRulerMeasure,
  IconUsers,
} from "@tabler/icons-react";
import { ViewTracker } from "@/components/guest/analytics-tracker";
import { getPublishedHotelContent, getPublishedRoom, getPublishedTours, matchesSeason, pickTourForRoom } from "@/lib/hotels-repo";
import { amenityLabel } from "@/lib/amenities-catalog";
import { guestShareMeta } from "@/lib/guest-seo";
import { guestPaths, type GuestSurface } from "@/lib/guest-surface";
import { PageBanner } from "@/components/guest/page-banner";
import { resolveGuestRoomPrice } from "@/lib/guest-pricing";
import {
  applyDiscount,
  formatDateRangeTr,
  formatPrice,
} from "@/lib/price";
import { formatOccupancySummary } from "@/lib/occupancy-price";
import { boardTypeLabels } from "@/lib/schemas/hotel-content";

export type RoomPageProps = {
  params: Promise<{ slug: string; roomSlug: string }>;
  surface?: GuestSurface;
};

export async function generateRoomMetadata(
  { params }: RoomPageProps,
  surface: GuestSurface = "yaz",
): Promise<Metadata> {
  const { slug, roomSlug } = await params;
  const r = await getPublishedRoom(slug, roomSlug);
  if (!r) return { title: "Oda" };
  if (surface !== "yaz") {
    const content = await getPublishedHotelContent(slug);
    if (!matchesSeason(content.specs.seasons, surface)) return { title: "Oda" };
  }
  return guestShareMeta({
    title: `${r.room.name} — ${r.hotel.name}`,
    description: r.room.description ?? undefined,
    imageUrl: r.room.imageUrl || r.hotel.imageUrl,
  });
}

export async function RoomPage({ params, surface = "yaz" }: RoomPageProps) {
  const { slug, roomSlug } = await params;
  const data = await getPublishedRoom(slug, roomSlug);
  if (!data) notFound();
  if (surface !== "yaz") {
    const content = await getPublishedHotelContent(slug);
    if (!matchesSeason(content.specs.seasons, surface)) notFound();
  }
  const { hotel, room, promotions, ratePlanPrices } = data;
  const paths = guestPaths(surface);
  // Bu odaya ait yayımlanmış tur varsa onu, yoksa tesisin genel turunu aç.
  // (Eskiden mock manifest üzerinden yalnızca demo oteli kontrol ediliyordu.)
  const roomTour = pickTourForRoom(await getPublishedTours(slug), roomSlug);

  const features: { icon: typeof IconBed; label: string }[] = [];
  if (room.sizeSqm != null) features.push({ icon: IconRulerMeasure, label: `${room.sizeSqm} m²` });
  if (room.capacityAdults != null) {
    features.push({
      icon: IconUsers,
      label: `${room.capacityAdults} yetişkin${room.capacityChildren ? ` + ${room.capacityChildren} çocuk` : ""}`,
    });
  }
  if (room.bedConfig) features.push({ icon: IconBed, label: room.bedConfig });
  if (room.viewType) features.push({ icon: IconEye, label: room.viewType });

  const priced = resolveGuestRoomPrice({
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
    promotions,
    ratePlanPrices,
  });
  const hasDiscount =
    !priced.priceOnRequest &&
    priced.priceMinor != null &&
    priced.originalPriceMinor != null &&
    priced.priceMinor < priced.originalPriceMinor;
  const finalMinor = priced.priceMinor;
  const boardLabel =
    room.boardType && room.boardType !== "sadece-oda"
      ? boardTypeLabels[room.boardType as keyof typeof boardTypeLabels] ?? room.boardType
      : null;

  return (
    <>
      <PageBanner
        overlap
        before={
          <nav aria-label="Sayfa yolu" className="pb-crumbs">
            <Link href={paths.browse}>Oteller</Link>
            <IconChevronRight size={13} aria-hidden />
            <Link href={paths.hotel(hotel.slug)}>{hotel.name}</Link>
            <IconChevronRight size={13} aria-hidden />
            <span>{room.name}</span>
          </nav>
        }
        eyebrow={room.tagline || undefined}
        title={room.name}
      >
        {features.length > 0 && (
          <div className="pb-meta">
            {features.map((f) => (
              <span key={f.label} className="pb-meta-item">
                <f.icon size={16} aria-hidden />
                {f.label}
              </span>
            ))}
          </div>
        )}
      </PageBanner>
    <div className="er-container" style={{ paddingBottom: "clamp(32px, 5vw, 64px)" }}>
      {/* Oda görüntüleme olayı — panel analitiğinde oda bazlı ilgi */}
      <ViewTracker
        eventType="room_view"
        hotelSlug={slug}
        payload={{ roomSlug, hasTour: Boolean(roomTour) }}
      />

      {/* Hero image */}
      <div
        style={{
          position: "relative",
          // En-boy oranı + maxHeight geniş ekranda görseli daraltıyordu.
          height: "clamp(220px, 42vw, 480px)",
          overflow: "hidden",
          borderRadius: "var(--er-radius-md)",
          marginBottom: "clamp(28px, 4vw, 48px)",
          border: "1px solid var(--er-line)",
        }}
        className="pb-lift"
      >
        <Image
          src={room.imageUrl || hotel.imageUrl}
          alt={room.name}
          fill
          priority
          sizes="(max-width: 1280px) 100vw, 1200px"
          style={{ objectFit: "cover" }}
        />
        {/* Gradient overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to top, rgba(14,31,64,0.45) 0%, transparent 55%)",
          }}
        />
      </div>

      {/* Two-column layout: content + actions */}
      <div className="er-room-layout">
        {/* Left: copy */}
        <div>
          <p
            style={{
              margin: 0,
              fontFamily: "var(--er-font-sans)",
              fontSize: "clamp(15px, 1.6vw, 17px)",
              lineHeight: 1.75,
              color: "var(--er-text-muted)",
              maxWidth: 660,
            }}
          >
            {room.description}
          </p>

          {room.amenities.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <p
                style={{
                  margin: "0 0 12px",
                  fontFamily: "var(--er-font-sans)",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--er-primary)",
                }}
              >
                Oda Olanakları
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {room.amenities.map((a) => (
                  <span
                    key={a}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "var(--er-radius-pill)",
                      border: "1px solid var(--er-line)",
                      color: "var(--er-text-muted)",
                      fontFamily: "var(--er-font-sans)",
                      fontSize: 13,
                    }}
                  >
                    {amenityLabel(a)}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 28 }}>
            {priced.hasCampaign && !hasDiscount && (
              <p
                style={{
                  margin: "0 0 4px",
                  fontFamily: "var(--er-font-sans)",
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--er-primary)",
                }}
              >
                Kampanya
              </p>
            )}
            {hasDiscount && (
              <p
                style={{
                  margin: "0 0 4px",
                  fontFamily: "var(--er-font-sans)",
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--er-primary)",
                }}
              >
                {room.discountLabel || priced.discountLabel || `%${room.discountPercent} indirim`}
              </p>
            )}
            <p
              style={{
                margin: 0,
                fontFamily: "var(--er-font-sans)",
                fontSize: 22,
                fontWeight: 700,
                color: "var(--er-primary)",
              }}
            >
              {hasDiscount && (
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: 400,
                    color: "var(--er-text-dim)",
                    textDecoration: "line-through",
                    marginRight: 10,
                  }}
                >
                  {formatPrice(priced.originalPriceMinor, priced.currency, false)}
                </span>
              )}
              {formatPrice(finalMinor, priced.currency, priced.priceOnRequest)}
              {!priced.priceOnRequest && (
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--er-text-dim)", marginLeft: 8 }}>
                  / gece{priced.rateName ? ` · ${priced.rateName}` : ""}
                </span>
              )}
            </p>
            {(boardLabel || priced.minStayNights != null) && (
              <p
                style={{
                  margin: "8px 0 0",
                  fontFamily: "var(--er-font-sans)",
                  fontSize: 13,
                  color: "var(--er-text-muted)",
                }}
              >
                {[boardLabel, priced.minStayNights != null ? `En az ${priced.minStayNights} gece` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            {room.pricingNotes && (
              <p
                style={{
                  margin: "8px 0 0",
                  fontFamily: "var(--er-font-sans)",
                  fontSize: 13,
                  color: "var(--er-text-dim)",
                }}
              >
                {room.pricingNotes}
              </p>
            )}
          </div>

          {room.rates.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <p
                style={{
                  margin: "0 0 12px",
                  fontFamily: "var(--er-font-sans)",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--er-primary)",
                }}
              >
                Fiyat Dönemleri
              </p>
              <div
                style={{
                  border: "1px solid var(--er-line)",
                  borderRadius: "var(--er-radius)",
                  overflow: "hidden",
                }}
              >
                {room.rates.map((r, i) => (
                  <div
                    key={r.id}
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "12px 16px",
                      borderTop: i > 0 ? "1px solid var(--er-line)" : "none",
                      fontFamily: "var(--er-font-sans)",
                      fontSize: 14,
                    }}
                  >
                    <span style={{ color: "var(--er-text)", fontWeight: 500 }}>
                      {r.name}
                      <span style={{ color: "var(--er-text-dim)", fontWeight: 400, marginLeft: 10, fontSize: 13 }}>
                        {formatDateRangeTr(r.startDate, r.endDate)}
                        {r.minStayNights != null ? ` · en az ${r.minStayNights} gece` : ""}
                      </span>
                    </span>
                    <span style={{ color: "var(--er-primary)", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {hasDiscount ? (
                        <>
                          <span
                            style={{
                              color: "var(--er-text-dim)",
                              fontWeight: 400,
                              fontSize: 12,
                              textDecoration: "line-through",
                              marginRight: 8,
                            }}
                          >
                            {formatPrice(r.priceMinor, r.currency, false)}
                          </span>
                          {formatPrice(
                            applyDiscount(r.priceMinor, room.discountPercent as number),
                            r.currency,
                            false,
                          )}
                        </>
                      ) : (
                        formatPrice(r.priceMinor, r.currency, false)
                      )}
                      <span style={{ color: "var(--er-text-dim)", fontWeight: 400, fontSize: 12 }}> / gece (baz)</span>
                      {formatOccupancySummary(r, formatPrice) && (
                        <span
                          style={{
                            display: "block",
                            color: "var(--er-text-dim)",
                            fontWeight: 400,
                            fontSize: 12,
                            marginTop: 4,
                          }}
                        >
                          {formatOccupancySummary(r, formatPrice)}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: CTAs */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            minWidth: 180,
            flexShrink: 0,
          }}
        >
          {roomTour && (
            <Link
              href={paths.tour(slug, roomTour.tourId, roomSlug)}
              className="er-btn er-btn-cta"
              style={{ justifyContent: "center" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <polygon points="5,3 19,12 5,21"/>
              </svg>
              Video Turu İzle
            </Link>
          )}
          <Link
            href={`${paths.inquiry}?hotel=${hotel.slug}`}
            className="er-btn er-btn-ghost"
            style={{ justifyContent: "center" }}
          >
            Talep Gönder
          </Link>
        </div>
      </div>
    </div>
    </>
  );
}

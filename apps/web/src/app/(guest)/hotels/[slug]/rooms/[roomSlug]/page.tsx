/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  IconBed,
  IconEye,
  IconRulerMeasure,
  IconUsers,
} from "@tabler/icons-react";
import { getDemoTourManifest } from "@/lib/mocks/hotels";
import { getPublishedRoom } from "@/lib/hotels-repo";
import {
  applyDiscount,
  formatDateRangeTr,
  formatPrice,
  resolveCurrentRate,
} from "@/lib/price";
import { boardTypeLabels } from "@/lib/schemas/hotel-content";

type PageProps = {
  params: Promise<{ slug: string; roomSlug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, roomSlug } = await params;
  const r = await getPublishedRoom(slug, roomSlug);
  if (!r) return { title: "Oda" };
  return {
    title: `${r.room.name} — ${r.hotel.name}`,
    description: r.room.description ?? undefined,
  };
}

export default async function RoomPage({ params }: PageProps) {
  const { slug, roomSlug } = await params;
  const data = await getPublishedRoom(slug, roomSlug);
  if (!data) notFound();
  const { hotel, room } = data;
  const hasDemoTour = slug === "aurelia-bay" && getDemoTourManifest("aurelia-bay", "demo-lobby");
  const tourId = "demo-lobby";

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

  const rate = resolveCurrentRate(
    {
      priceMinor: room.priceMinor,
      currency: room.currency,
      priceOnRequest: room.priceOnRequest,
      minStayNights: room.minStayNights,
    },
    room.rates,
  );
  const hasDiscount =
    !rate.priceOnRequest && rate.priceMinor != null && room.discountPercent != null;
  const finalMinor = hasDiscount
    ? applyDiscount(rate.priceMinor as number, room.discountPercent as number)
    : rate.priceMinor;
  const boardLabel =
    room.boardType && room.boardType !== "sadece-oda"
      ? boardTypeLabels[room.boardType as keyof typeof boardTypeLabels] ?? room.boardType
      : null;

  return (
    <div
      style={{
        maxWidth: 1024,
        margin: "0 auto",
        padding: "clamp(32px, 5vw, 64px) clamp(24px, 5vw, 48px)",
      }}
    >
      {/* Breadcrumb */}
      <nav
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          fontFamily: "var(--lux-font-sans)",
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          marginBottom: 32,
        }}
      >
        <Link href="/browse" style={{ color: "var(--lux-dim)", textDecoration: "none" }}>
          Keşfet
        </Link>
        <span style={{ color: "var(--lux-line-strong)" }}>/</span>
        <Link href={`/hotels/${hotel.slug}`} style={{ color: "var(--lux-dim)", textDecoration: "none" }}>
          {hotel.name}
        </Link>
        <span style={{ color: "var(--lux-line-strong)" }}>/</span>
        <span style={{ color: "var(--lux-gold)" }}>{room.name}</span>
      </nav>

      {/* Hero image */}
      <div
        style={{
          position: "relative",
          aspectRatio: "16/9",
          maxHeight: 480,
          overflow: "hidden",
          borderRadius: 4,
          marginBottom: "clamp(28px, 4vw, 48px)",
          border: "1px solid rgba(138,155,176,0.16)",
        }}
      >
        <img
          src={room.imageUrl || hotel.imageUrl}
          alt={room.name}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
        {/* Gradient overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to top, rgba(11,15,18,0.65) 0%, transparent 55%)",
          }}
        />
      </div>

      {/* Two-column layout: content + actions */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: "clamp(24px, 4vw, 48px)",
          alignItems: "start",
        }}
      >
        {/* Left: copy */}
        <div>
          {/* Tagline badge */}
          <p
            style={{
              margin: "0 0 14px",
              fontFamily: "var(--lux-font-sans)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--lux-gold)",
            }}
          >
            {room.tagline}
          </p>

          <h1
            style={{
              margin: "0 0 20px",
              fontFamily: "var(--lux-font-sans)",
              fontSize: "clamp(28px, 4vw, 48px)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
              lineHeight: 1.1,
              color: "var(--lux-text)",
            }}
          >
            {room.name}
          </h1>

          <div
            style={{ width: 48, height: 2, background: "var(--lux-gold)", opacity: 0.65, marginBottom: 24 }}
          />

          <p
            style={{
              margin: 0,
              fontFamily: "var(--lux-font-sans)",
              fontSize: "clamp(15px, 1.6vw, 17px)",
              lineHeight: 1.75,
              color: "var(--lux-muted)",
              maxWidth: 660,
            }}
          >
            {room.description}
          </p>

          {features.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 18,
                marginTop: 28,
                color: "var(--lux-muted)",
                fontFamily: "var(--lux-font-sans)",
                fontSize: 14,
              }}
            >
              {features.map((f) => (
                <span
                  key={f.label}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 16px",
                    borderRadius: 999,
                    border: "1px solid rgba(208,197,178,0.22)",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  <f.icon size={16} color="var(--lux-gold)" />
                  {f.label}
                </span>
              ))}
            </div>
          )}

          {room.amenities.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <p
                style={{
                  margin: "0 0 12px",
                  fontFamily: "var(--lux-font-sans)",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--lux-gold)",
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
                      borderRadius: 999,
                      border: "1px solid rgba(208,197,178,0.18)",
                      color: "var(--lux-muted)",
                      fontFamily: "var(--lux-font-sans)",
                      fontSize: 13,
                    }}
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 28 }}>
            {hasDiscount && (
              <p
                style={{
                  margin: "0 0 4px",
                  fontFamily: "var(--lux-font-sans)",
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--lux-gold)",
                }}
              >
                {room.discountLabel || `%${room.discountPercent} indirim`}
              </p>
            )}
            <p
              style={{
                margin: 0,
                fontFamily: "var(--lux-font-sans)",
                fontSize: 22,
                fontWeight: 700,
                color: "var(--lux-gold)",
              }}
            >
              {hasDiscount && (
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: 400,
                    color: "var(--lux-dim)",
                    textDecoration: "line-through",
                    marginRight: 10,
                  }}
                >
                  {formatPrice(rate.priceMinor, rate.currency, false)}
                </span>
              )}
              {formatPrice(finalMinor, rate.currency, rate.priceOnRequest)}
              {!rate.priceOnRequest && (
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--lux-dim)", marginLeft: 8 }}>
                  / gece{rate.rateName ? ` · ${rate.rateName}` : ""}
                </span>
              )}
            </p>
            {(boardLabel || rate.minStayNights != null) && (
              <p
                style={{
                  margin: "8px 0 0",
                  fontFamily: "var(--lux-font-sans)",
                  fontSize: 13,
                  color: "var(--lux-muted)",
                }}
              >
                {[boardLabel, rate.minStayNights != null ? `En az ${rate.minStayNights} gece` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            {room.pricingNotes && (
              <p
                style={{
                  margin: "8px 0 0",
                  fontFamily: "var(--lux-font-sans)",
                  fontSize: 13,
                  color: "var(--lux-dim)",
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
                  fontFamily: "var(--lux-font-sans)",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--lux-gold)",
                }}
              >
                Fiyat Dönemleri
              </p>
              <div
                style={{
                  border: "1px solid rgba(208,197,178,0.18)",
                  borderRadius: 6,
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
                      borderTop: i > 0 ? "1px solid rgba(208,197,178,0.1)" : "none",
                      fontFamily: "var(--lux-font-sans)",
                      fontSize: 14,
                    }}
                  >
                    <span style={{ color: "var(--lux-text)", fontWeight: 500 }}>
                      {r.name}
                      <span style={{ color: "var(--lux-dim)", fontWeight: 400, marginLeft: 10, fontSize: 13 }}>
                        {formatDateRangeTr(r.startDate, r.endDate)}
                        {r.minStayNights != null ? ` · en az ${r.minStayNights} gece` : ""}
                      </span>
                    </span>
                    <span style={{ color: "var(--lux-gold)", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {hasDiscount ? (
                        <>
                          <span
                            style={{
                              color: "var(--lux-dim)",
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
                      <span style={{ color: "var(--lux-dim)", fontWeight: 400, fontSize: 12 }}> / gece</span>
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
          {hasDemoTour && (
            <Link
              href={`/tours/${slug}/${tourId}?room=${roomSlug}`}
              className="luxury-gold-button"
              style={{ borderRadius: 2, justifyContent: "center" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <polygon points="5,3 19,12 5,21"/>
              </svg>
              Video Turu İzle
            </Link>
          )}
          <Link
            href={`/inquiry?hotel=${hotel.slug}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 48,
              padding: "0 2rem",
              fontFamily: "var(--lux-font-sans)",
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: "0.04em",
              color: "var(--lux-muted)",
              border: "1px solid rgba(208,197,178,0.25)",
              borderRadius: 2,
              textDecoration: "none",
              transition: "color 220ms, border-color 220ms",
            }}
          >
            Talep Gönder
          </Link>
        </div>
      </div>
    </div>
  );
}

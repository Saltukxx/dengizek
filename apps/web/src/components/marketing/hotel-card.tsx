import Image from "next/image";
import Link from "next/link";
import { IconStarFilled } from "@tabler/icons-react";
import type { HotelMock } from "@/lib/mocks/hotels";

type HotelCardProps = {
  hotel: HotelMock;
  href?: string;
  /** Yayındaki yorumların ortalaması (1–5) — yorum yoksa gösterilmez. */
  reviewAverage?: number | null;
  reviewCount?: number;
};

/**
 * Luxury hotel listing card.
 * Tam-görsel arka plan, gradient overlay ve altta otel bilgisi.
 * CSS sınıfları globals.css .lux-hotel-card ile stillendirilir.
 */
export function HotelCard({
  hotel,
  href = `/hotels/${hotel.slug}`,
  reviewAverage,
  reviewCount = 0,
}: HotelCardProps) {
  return (
    <Link href={href} className="lux-hotel-card">
      {/* Background image */}
      <Image
        src={hotel.imageUrl}
        alt={hotel.name}
        fill
        sizes="(max-width: 768px) 100vw, 50vw"
        style={{ objectFit: "cover" }}
      />

      {/* Gradient overlay */}
      <div className="lux-card-overlay" />

      {/* Price badge */}
      {hotel.priceLabel && (
        <div className="lux-price-badge">{hotel.priceLabel}</div>
      )}

      {/* Copy */}
      <div className="lux-card-copy">
        {/* Location eyebrow */}
        <p
          style={{
            margin: "0 0 8px",
            fontFamily: "var(--lux-font-sans)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--lux-gold)",
            opacity: 0.85,
          }}
        >
          {hotel.city} · {hotel.country}
        </p>

        <h3>{hotel.name}</h3>

        {reviewAverage != null && reviewCount > 0 && (
          <p
            style={{
              margin: "6px 0 0",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "var(--lux-muted)",
            }}
          >
            <IconStarFilled size={13} color="var(--lux-gold)" />
            <span style={{ color: "var(--lux-gold)" }}>
              {reviewAverage.toLocaleString("tr-TR")}
            </span>
            <span>({reviewCount} yorum)</span>
          </p>
        )}

        <p
          style={{
            margin: "8px 0 0",
            fontSize: 13,
            color: "var(--lux-muted)",
            letterSpacing: "0.03em",
          }}
        >
          {hotel.shortDescription}
        </p>
      </div>
    </Link>
  );
}

import Image from "next/image";
import Link from "next/link";
import { IconMapPin, IconStarFilled } from "@tabler/icons-react";
import type { HotelMock } from "@/lib/mocks/hotels";
import { amenityLabel } from "@/lib/amenities-catalog";
import { formatPrice } from "@/lib/price";

type HotelCardProps = {
  hotel: HotelMock;
  href?: string;
  /** Yayındaki yorumların ortalaması (1–5) — yorum yoksa gösterilmez. */
  reviewAverage?: number | null;
  reviewCount?: number;
  /** Tesis yıldızı — görselin üzerindeki rozette gösterilir. */
  starRating?: number | null;
  /** En fazla iki olanak çipi gösterilir. */
  amenities?: string[];
  /** En düşük oda fiyatı (en küçük birim); yoksa priceLabel kullanılır. */
  minPriceMinor?: number | null;
  currency?: string;
  actionLabel?: string;
};

/**
 * Elite Reserve otel kartı — 16:9 görsel, mavi başlık, olanak çipleri ve
 * alt satırda fiyat + turuncu eylem düğmesi.
 */
export function HotelCard({
  hotel,
  href = `/hotels/${hotel.slug}`,
  reviewAverage,
  reviewCount = 0,
  starRating,
  amenities = [],
  minPriceMinor,
  currency = "TRY",
  actionLabel = "Detayları Gör",
}: HotelCardProps) {
  const hasReviews = reviewAverage != null && reviewCount > 0;
  const priceAmount =
    minPriceMinor != null
      ? formatPrice(minPriceMinor, currency)
      : hotel.priceLabel && /\d/.test(hotel.priceLabel)
        ? hotel.priceLabel
        : null;
  const location = [hotel.city, hotel.country].filter(Boolean).join(", ");

  return (
    <article className="er-hotel-card">
      <Link href={href} className="er-hotel-media" aria-label={hotel.name}>
        {hotel.imageUrl ? (
          <Image
            src={hotel.imageUrl}
            alt={hotel.name}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 420px"
            style={{ objectFit: "cover" }}
          />
        ) : null}

        {starRating ? (
          <span
            className="er-rating-badge"
            style={{ position: "absolute", top: 12, left: 12, zIndex: 2 }}
          >
            <IconStarFilled size={13} style={{ color: "var(--er-cta)" }} />
            {starRating} Yıldız
          </span>
        ) : null}
      </Link>

      <div className="er-hotel-body">
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <h3 className="er-hotel-title" style={{ flex: 1 }}>
            <Link href={href}>{hotel.name}</Link>
          </h3>
          {hasReviews && (
            <span className="er-score" title={`${reviewCount} yorum`}>
              {reviewAverage.toLocaleString("tr-TR", { minimumFractionDigits: 1 })}
            </span>
          )}
        </div>

        {location && (
          <p
            style={{
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 14,
              color: "var(--er-text-muted)",
            }}
          >
            <IconMapPin size={15} stroke={1.8} style={{ color: "var(--er-text-dim)" }} />
            {location}
          </p>
        )}

        {hotel.shortDescription && (
          <p
            style={{
              margin: 0,
              fontSize: 14,
              lineHeight: 1.55,
              color: "var(--er-text-muted)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {hotel.shortDescription}
          </p>
        )}

        {amenities.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {amenities.slice(0, 2).map((key) => (
              <span key={key} className="er-chip">
                {amenityLabel(key)}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="er-hotel-foot">
        <div>
          {priceAmount ? (
            <>
              <div className="er-price">{priceAmount}</div>
              <div className="er-price-note">gecelik başlayan</div>
            </>
          ) : (
            <div className="er-price-note">Fiyat için talep gönderin</div>
          )}
        </div>
        <Link href={href} className="er-btn er-btn-primary" style={{ minHeight: 44 }}>
          {actionLabel}
        </Link>
      </div>
    </article>
  );
}

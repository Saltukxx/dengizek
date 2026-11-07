import Image from "next/image";
import Link from "next/link";
import { IconPlayerPlayFilled, IconRosetteDiscount } from "@tabler/icons-react";
import type { HotelMock } from "@/lib/mocks/hotels";
import { amenityLabel, highlightAmenityKeys } from "@/lib/amenities-catalog";
import { formatPrice } from "@/lib/price";

type HotelCardProps = {
  hotel: HotelMock;
  href?: string;
  /** Kartın ekranda kapladığı genişlik (next/image). Mobil rayda ~%82. */
  sizes?: string;
  /** Yayındaki yorumların ortalaması (1–5) — yorum yoksa gösterilmez. */
  reviewAverage?: number | null;
  reviewCount?: number;
  /** Tesis yıldızı — konum satırında gösterilir. */
  starRating?: number | null;
  /** En fazla üç olanak, öncelik sırasına göre tek satırda gösterilir. */
  amenities?: string[];
  /** En düşük oda fiyatı (en küçük birim); yoksa priceLabel kullanılır. */
  minPriceMinor?: number | null;
  currency?: string;
  /** Yayında video turu olan tesislerde görselin üzerinde rozet çıkar. */
  hasTour?: boolean;
  /** Geçerli kampanya ("4 kal 3 öde", "%15 indirim") — görselin üzerinde gösterilir. */
  promotionBadge?: string | null;
};

function highlightAmenities(values: string[]): string[] {
  return highlightAmenityKeys(values, 3).map(amenityLabel);
}

/**
 * Otel kartı — kartın tamamı tek bağlantıdır (başlık bağlantısı kartı kaplar),
 * böylece her kartta tekrarlanan bir "Detaylar" düğmesine gerek kalmaz.
 */
export function HotelCard({
  hotel,
  href = `/hotels/${hotel.slug}`,
  sizes = "(max-width: 768px) 82vw, (max-width: 1280px) 50vw, 420px",
  reviewAverage,
  reviewCount = 0,
  starRating,
  amenities = [],
  minPriceMinor,
  currency = "TRY",
  hasTour = false,
  promotionBadge = null,
}: HotelCardProps) {
  const hasReviews = reviewAverage != null && reviewCount > 0;
  const priceAmount =
    minPriceMinor != null
      ? formatPrice(minPriceMinor, currency)
      : hotel.priceLabel && /\d/.test(hotel.priceLabel)
        ? hotel.priceLabel
        : null;
  const meta = [hotel.city, starRating ? `${starRating} yıldızlı` : null].filter(Boolean).join(" · ");
  const highlights = highlightAmenities(amenities);

  return (
    <article className="er-hotel-card">
      <div className="er-hotel-media">
        {hotel.imageUrl ? (
          <Image
            src={hotel.imageUrl}
            alt=""
            fill
            sizes={sizes}
            style={{ objectFit: "cover" }}
          />
        ) : null}
        {hasTour ? (
          <span className="er-tour-badge">
            <IconPlayerPlayFilled size={12} aria-hidden />
            Video tur
          </span>
        ) : null}
        {promotionBadge ? (
          <span className="er-promo-badge">
            <IconRosetteDiscount size={14} aria-hidden />
            <span>
              <span className="er-visually-hidden">Kampanya: </span>
              {promotionBadge}
            </span>
          </span>
        ) : null}
      </div>

      <div className="er-hotel-body">
        <div className="er-hotel-heading">
          <h3 className="er-hotel-title">
            <Link href={href} className="er-stretched-link">
              {hotel.name}
            </Link>
          </h3>
          {hasReviews && (
            <span className="er-score" title={`${reviewCount} yorum`}>
              {reviewAverage.toLocaleString("tr-TR", { minimumFractionDigits: 1 })}
            </span>
          )}
        </div>

        {meta && <p className="er-hotel-meta">{meta}</p>}

        {hotel.shortDescription && <p className="er-hotel-desc">{hotel.shortDescription}</p>}

        {highlights.length > 0 && <p className="er-hotel-highlights">{highlights.join(" · ")}</p>}
      </div>

      <div className="er-hotel-foot">
        {priceAmount ? (
          <p>
            <span className="er-price">{priceAmount}</span>{" "}
            <span className="er-price-note">gecelik başlayan</span>
          </p>
        ) : (
          <p className="er-price-note">Fiyat talep üzerine</p>
        )}
      </div>
    </article>
  );
}

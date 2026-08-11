/* eslint-disable @next/next/no-img-element */
// ---------------------------------------------------------------------------
// Misafir oda bölümü — panelde tanımlanan odaları lüks kart ızgarasında gösterir.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { IconBed, IconRulerMeasure, IconUsers } from "@tabler/icons-react";
import type { RoomWithRates } from "@/lib/hotels-repo";
import { resolveGuestRoomPrice, type GuestPromotion, type GuestRatePlanPrice } from "@/lib/guest-pricing";
import { formatPrice } from "@/lib/price";
import { boardTypeLabels } from "@/lib/schemas/hotel-content";

export function RoomsSection({
  hotelSlug,
  rooms,
  promotions = [],
  ratePlanPrices = [],
}: {
  hotelSlug: string;
  rooms: RoomWithRates[];
  promotions?: GuestPromotion[];
  ratePlanPrices?: GuestRatePlanPrice[];
}) {
  if (rooms.length === 0) return null;

  return (
    <section id="odalar" className="er-detail-section">
      <div style={{ marginBottom: 24 }}>
        <h2
          className="er-display er-h2"
        >
          Odalarımız
        </h2>
        
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(340px, 100%), 1fr))",
          gap: 24,
        }}
      >
        {rooms.map((room) => {
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
          return (
          <Link
            key={room.id}
            href={`/hotels/${hotelSlug}/rooms/${room.slug}`}
            className="er-card"
            style={{
              display: "flex",
              flexDirection: "column",
              borderRadius: "var(--er-radius-md)",
              overflow: "hidden",
              textDecoration: "none",
              border: "1px solid var(--er-line)",
              background: "var(--er-surface)",
              boxShadow: "var(--er-shadow-sm)",
            }}
          >
            {room.imageUrl && (
              <div style={{ position: "relative", aspectRatio: "16/10", overflow: "hidden" }}>
                <img
                  src={room.imageUrl}
                  alt={room.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(to top, rgba(14,31,64,0.45), transparent 60%)",
                  }}
                />
                {priced.hasCampaign && (
                  <span
                    style={{
                      position: "absolute",
                      top: 12,
                      left: 12,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      padding: "5px 10px",
                      borderRadius: 4,
                      background: "var(--er-cta)",
                      color: "#fff",
                    }}
                  >
                    Kampanya
                  </span>
                )}
              </div>
            )}
            <div style={{ padding: "20px 22px 22px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
              {room.tagline && (
                <p className="er-eyebrow" style={{ margin: 0, color: "var(--er-primary)", fontSize: 11 }}>
                  {room.tagline}
                </p>
              )}
              <h3
                className="er-display"
                style={{ margin: 0, fontSize: 24, color: "var(--er-text)" }}
              >
                {room.name}
              </h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14, color: "var(--er-text-dim)", fontSize: 13 }}>
                {room.sizeSqm != null && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <IconRulerMeasure size={15} /> {room.sizeSqm} m²
                  </span>
                )}
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <IconUsers size={15} /> {room.capacityAdults} yetişkin
                  {room.capacityChildren > 0 ? ` + ${room.capacityChildren} çocuk` : ""}
                </span>
                {room.bedConfig && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <IconBed size={15} /> {room.bedConfig}
                  </span>
                )}
              </div>
              {(room.boardType || priced.discountLabel) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {room.boardType && room.boardType !== "sadece-oda" && (
                    <span
                      style={{
                        fontSize: 11,
                        padding: "3px 10px",
                        borderRadius: 999,
                        border: "1px solid var(--er-line)",
                        color: "var(--er-text-muted)",
                      }}
                    >
                      {boardTypeLabels[room.boardType as keyof typeof boardTypeLabels] ??
                        room.boardType}
                    </span>
                  )}
                  {hasDiscount && priced.discountLabel && (
                    <span
                      style={{
                        fontSize: 11,
                        padding: "3px 10px",
                        borderRadius: 999,
                        border: "1px solid var(--er-line)",
                        color: "var(--er-primary)",
                      }}
                    >
                      {priced.discountLabel}
                    </span>
                  )}
                </div>
              )}
              <div style={{ marginTop: "auto", paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ color: "var(--er-primary)", fontWeight: 700, fontSize: 17 }}>
                  {hasDiscount && (
                    <span
                      style={{
                        color: "var(--er-text-dim)",
                        fontWeight: 400,
                        fontSize: 13,
                        textDecoration: "line-through",
                        marginRight: 8,
                      }}
                    >
                      {formatPrice(priced.originalPriceMinor, priced.currency, false)}
                    </span>
                  )}
                  {formatPrice(priced.priceMinor, priced.currency, priced.priceOnRequest)}
                </span>
                {!priced.priceOnRequest && (
                  <span style={{ color: "var(--er-text-dim)", fontSize: 12 }}>gecelik</span>
                )}
              </div>
            </div>
          </Link>
          );
        })}
      </div>
    </section>
  );
}

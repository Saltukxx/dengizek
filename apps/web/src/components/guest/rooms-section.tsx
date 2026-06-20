/* eslint-disable @next/next/no-img-element */
// ---------------------------------------------------------------------------
// Misafir oda bölümü — panelde tanımlanan odaları lüks kart ızgarasında gösterir.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { IconBed, IconRulerMeasure, IconUsers } from "@tabler/icons-react";
import type { RoomWithRates } from "@/lib/hotels-repo";
import { applyDiscount, formatPrice, resolveCurrentRate } from "@/lib/price";
import { boardTypeLabels } from "@/lib/schemas/hotel-content";

export function RoomsSection({
  hotelSlug,
  rooms,
}: {
  hotelSlug: string;
  rooms: RoomWithRates[];
}) {
  if (rooms.length === 0) return null;

  return (
    <section id="odalar" style={{ maxWidth: 1280, margin: "0 auto", padding: "64px 32px 96px" }}>
      <div style={{ marginBottom: 42 }}>
        <h2
          className="luxury-sans-title"
          style={{ margin: 0, fontSize: "clamp(42px, 5vw, 64px)", lineHeight: 1.08 }}
        >
          Odalarımız
        </h2>
        <div style={{ width: 50, height: 4, background: "var(--lux-gold)", marginTop: 16 }} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(340px, 100%), 1fr))",
          gap: 24,
        }}
      >
        {rooms.map((room) => {
          const rate = resolveCurrentRate(room, room.rates);
          const hasDiscount =
            !rate.priceOnRequest && rate.priceMinor != null && room.discountPercent != null;
          const finalMinor = hasDiscount
            ? applyDiscount(rate.priceMinor as number, room.discountPercent as number)
            : rate.priceMinor;
          return (
          <Link
            key={room.id}
            href={`/hotels/${hotelSlug}/rooms/${room.slug}`}
            className="luxury-glass"
            style={{
              display: "flex",
              flexDirection: "column",
              borderRadius: 8,
              overflow: "hidden",
              textDecoration: "none",
              border: "1px solid rgba(212,175,55,0.18)",
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
                    background: "linear-gradient(to top, rgba(11,15,18,0.55), transparent 60%)",
                  }}
                />
              </div>
            )}
            <div style={{ padding: "20px 22px 22px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
              {room.tagline && (
                <p className="luxury-label" style={{ margin: 0, color: "var(--lux-gold)", fontSize: 11 }}>
                  {room.tagline}
                </p>
              )}
              <h3
                className="luxury-sans-title"
                style={{ margin: 0, fontSize: 24, color: "var(--lux-text)" }}
              >
                {room.name}
              </h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14, color: "var(--lux-dim)", fontSize: 13 }}>
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
              {(room.boardType || room.discountLabel) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {room.boardType && room.boardType !== "sadece-oda" && (
                    <span
                      style={{
                        fontSize: 11,
                        padding: "3px 10px",
                        borderRadius: 999,
                        border: "1px solid rgba(208,197,178,0.25)",
                        color: "var(--lux-muted)",
                      }}
                    >
                      {boardTypeLabels[room.boardType as keyof typeof boardTypeLabels] ??
                        room.boardType}
                    </span>
                  )}
                  {hasDiscount && (
                    <span
                      style={{
                        fontSize: 11,
                        padding: "3px 10px",
                        borderRadius: 999,
                        border: "1px solid rgba(212,175,55,0.45)",
                        color: "var(--lux-gold)",
                      }}
                    >
                      {room.discountLabel || `%${room.discountPercent} indirim`}
                    </span>
                  )}
                </div>
              )}
              <div style={{ marginTop: "auto", paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ color: "var(--lux-gold)", fontWeight: 700, fontSize: 17 }}>
                  {hasDiscount && (
                    <span
                      style={{
                        color: "var(--lux-dim)",
                        fontWeight: 400,
                        fontSize: 13,
                        textDecoration: "line-through",
                        marginRight: 8,
                      }}
                    >
                      {formatPrice(rate.priceMinor, rate.currency, false)}
                    </span>
                  )}
                  {formatPrice(finalMinor, rate.currency, rate.priceOnRequest)}
                </span>
                {!rate.priceOnRequest && (
                  <span style={{ color: "var(--lux-dim)", fontSize: 12 }}>gecelik</span>
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

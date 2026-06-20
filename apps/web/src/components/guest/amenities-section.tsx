// ---------------------------------------------------------------------------
// Misafir olanaklar bölümü — kategorilere ayrılmış çipler + tesis özellikleri.
// ---------------------------------------------------------------------------

import { IconClock, IconDoor, IconStar } from "@tabler/icons-react";
import { groupAmenities } from "@/lib/amenities-catalog";
import type { HotelSpecs } from "@/lib/hotels-repo";

export function AmenitiesSection({
  amenities,
  specs,
}: {
  amenities: string[];
  specs: HotelSpecs;
}) {
  const hasSpecs =
    specs.starRating != null ||
    specs.totalRooms != null ||
    specs.checkInTime ||
    specs.checkOutTime;
  if (amenities.length === 0 && !hasSpecs) return null;

  const groups = groupAmenities(amenities);

  return (
    <section style={{ maxWidth: 1280, margin: "0 auto", padding: "0 32px 96px" }}>
      <div style={{ marginBottom: 42 }}>
        <h2
          className="luxury-sans-title"
          style={{ margin: 0, fontSize: "clamp(36px, 4.5vw, 56px)", lineHeight: 1.08 }}
        >
          Otel Özellikleri
        </h2>
        <div style={{ width: 50, height: 4, background: "var(--lux-gold)", marginTop: 16 }} />
      </div>

      {hasSpecs && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 28,
            marginBottom: 40,
            color: "var(--lux-muted)",
            fontSize: 15,
          }}
        >
          {specs.starRating != null && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <IconStar size={18} color="var(--lux-gold)" />
              {specs.starRating} yıldız
            </span>
          )}
          {specs.totalRooms != null && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <IconDoor size={18} color="var(--lux-gold)" />
              {specs.totalRooms} oda
            </span>
          )}
          {(specs.checkInTime || specs.checkOutTime) && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <IconClock size={18} color="var(--lux-gold)" />
              {specs.checkInTime && `Giriş ${specs.checkInTime}`}
              {specs.checkInTime && specs.checkOutTime && " · "}
              {specs.checkOutTime && `Çıkış ${specs.checkOutTime}`}
            </span>
          )}
        </div>
      )}

      <div style={{ display: "grid", gap: 28 }}>
        {groups.map((group) => (
          <div key={group.category}>
            <p
              className="luxury-label"
              style={{ margin: "0 0 12px", color: "var(--lux-gold)", fontSize: 12 }}
            >
              {group.category}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {group.items.map((item) => (
                <span
                  key={item.key}
                  style={{
                    padding: "7px 16px",
                    borderRadius: 999,
                    border: "1px solid rgba(208,197,178,0.22)",
                    background: "rgba(255,255,255,0.03)",
                    color: "var(--lux-muted)",
                    fontSize: 13,
                  }}
                >
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

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
    <section className="er-detail-section">
      <div style={{ marginBottom: 24 }}>
        <h2
          className="er-display er-h2"
        >
          Otel Özellikleri
        </h2>
        
      </div>

      {hasSpecs && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 28,
            marginBottom: 40,
            color: "var(--er-text-muted)",
            fontSize: 15,
          }}
        >
          {specs.starRating != null && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <IconStar size={18} color="var(--er-primary)" />
              {specs.starRating} yıldız
            </span>
          )}
          {specs.totalRooms != null && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <IconDoor size={18} color="var(--er-primary)" />
              {specs.totalRooms} oda
            </span>
          )}
          {(specs.checkInTime || specs.checkOutTime) && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <IconClock size={18} color="var(--er-primary)" />
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
              className="er-eyebrow"
              style={{ margin: "0 0 12px", color: "var(--er-primary)", fontSize: 12 }}
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
                    border: "1px solid var(--er-line)",
                    background: "var(--er-surface-2)",
                    color: "var(--er-text-muted)",
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

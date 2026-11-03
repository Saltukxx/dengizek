// ---------------------------------------------------------------------------
// Misafir olanaklar bölümü — kategori başına tek satır metin.
// Çok sayıda olanağı olan tesislerde çip yığını yerine taranabilir bir liste.
// ---------------------------------------------------------------------------

import { groupAmenities } from "@/lib/amenities-catalog";
import type { HotelSpecs } from "@/lib/hotels-repo";

export function AmenitiesSection({
  amenities,
  specs,
}: {
  amenities: string[];
  specs: HotelSpecs;
}) {
  // Yıldız başlıkta, giriş/çıkış saatleri rezervasyon panelinde zaten var;
  // burada yalnızca başka yerde görünmeyen oda sayısı kalır.
  if (amenities.length === 0 && specs.totalRooms == null) return null;

  const groups = groupAmenities(amenities);

  return (
    <section className="er-detail-section">
      <h2 className="er-display er-h2">Olanaklar</h2>
      {specs.totalRooms != null && (
        <p className="er-muted" style={{ margin: "8px 0 0", fontSize: 15 }}>
          {specs.totalRooms} odalı tesis
        </p>
      )}

      {groups.length > 0 && (
        <dl className="er-amenity-list">
          {groups.map((group) => (
            <div key={group.category}>
              <dt>{group.category}</dt>
              <dd>{group.items.map((item) => item.label).join(", ")}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

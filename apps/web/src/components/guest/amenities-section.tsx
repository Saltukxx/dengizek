// ---------------------------------------------------------------------------
// Misafir olanaklar bölümü — kategori başına etiketler; kalabalık grupta
// ilk birkaçı görünür, kalanı "Tümünü gör" ile açılır.
// ---------------------------------------------------------------------------

import { groupAmenities } from "@/lib/amenities-catalog";
import type { HotelSpecs } from "@/lib/hotels-repo";

/** Bir grupta önce gösterilen olanak sayısı; kalanı "Tümünü gör" altında. */
const GROUP_PREVIEW = 8;

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
          {groups.map((group) => {
            const shown = group.items.slice(0, GROUP_PREVIEW);
            const rest = group.items.slice(GROUP_PREVIEW);
            return (
              <div key={group.category}>
                <dt>{group.category}</dt>
                <dd>
                  <ul className="er-amenity-chips">
                    {shown.map((item) => (
                      <li key={item.label}>{item.label}</li>
                    ))}
                  </ul>
                  {rest.length > 0 && (
                    <details className="er-amenity-more">
                      <summary>Tümünü gör (+{rest.length})</summary>
                      <ul className="er-amenity-chips">
                        {rest.map((item) => (
                          <li key={item.label}>{item.label}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </section>
  );
}

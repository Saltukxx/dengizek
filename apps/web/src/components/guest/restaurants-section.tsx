/* eslint-disable @next/next/no-img-element */
// ---------------------------------------------------------------------------
// Misafir restoran bölümü — menü akordeonu (native details, sunucu bileşeni).
// ---------------------------------------------------------------------------

import { IconClock, IconMapPin, IconToolsKitchen2 } from "@tabler/icons-react";
import type { Restaurant } from "@/lib/db/schema";
import { formatPrice } from "@/lib/price";

const tagLabels: Record<string, string> = {
  vejetaryen: "Vejetaryen",
  vegan: "Vegan",
  glutensiz: "Glutensiz",
  acili: "Acılı",
};

export function RestaurantsSection({ restaurants }: { restaurants: Restaurant[] }) {
  if (restaurants.length === 0) return null;

  return (
    <section id="gastronomi" style={{ maxWidth: 1280, margin: "0 auto", padding: "0 32px 96px" }}>
      <div style={{ marginBottom: 42 }}>
        <h2
          className="luxury-sans-title"
          style={{ margin: 0, fontSize: "clamp(36px, 4.5vw, 56px)", lineHeight: 1.08 }}
        >
          Gastronomi
        </h2>
        <div style={{ width: 50, height: 4, background: "var(--lux-gold)", marginTop: 16 }} />
      </div>

      <div style={{ display: "grid", gap: 32 }}>
        {restaurants.map((restaurant) => (
          <article
            key={restaurant.id}
            className="luxury-glass"
            style={{ borderRadius: 8, overflow: "hidden", border: "1px solid rgba(212,175,55,0.18)" }}
          >
            {restaurant.imageUrl && (
              <div style={{ position: "relative", maxHeight: 280, overflow: "hidden" }}>
                <img
                  src={restaurant.imageUrl}
                  alt={restaurant.name}
                  style={{ width: "100%", height: 280, objectFit: "cover" }}
                />
                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(to top, rgba(11,15,18,0.7), transparent 55%)",
                  }}
                />
              </div>
            )}
            <div style={{ padding: "26px 28px 28px" }}>
              {restaurant.cuisine && (
                <p className="luxury-label" style={{ margin: "0 0 10px", color: "var(--lux-gold)", fontSize: 11 }}>
                  {restaurant.cuisine}
                </p>
              )}
              <h3 className="luxury-sans-title" style={{ margin: 0, fontSize: 28, color: "var(--lux-text)" }}>
                {restaurant.name}
              </h3>
              {restaurant.description && (
                <p style={{ margin: "12px 0 0", color: "var(--lux-muted)", lineHeight: 1.7, maxWidth: 720 }}>
                  {restaurant.description}
                </p>
              )}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 20,
                  marginTop: 16,
                  color: "var(--lux-dim)",
                  fontSize: 13,
                }}
              >
                {restaurant.hours && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <IconClock size={15} /> {restaurant.hours}
                  </span>
                )}
                {restaurant.location && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <IconMapPin size={15} /> {restaurant.location}
                  </span>
                )}
              </div>

              {restaurant.menu.length > 0 && (
                <div style={{ marginTop: 26, display: "grid", gap: 10 }}>
                  {restaurant.menu.map((section) => (
                    <details
                      key={section.id}
                      style={{
                        border: "1px solid rgba(208,197,178,0.18)",
                        borderRadius: 6,
                        background: "rgba(255,255,255,0.02)",
                      }}
                    >
                      <summary
                        style={{
                          cursor: "pointer",
                          listStyle: "none",
                          padding: "14px 18px",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          color: "var(--lux-text)",
                          fontWeight: 600,
                          fontSize: 15,
                        }}
                      >
                        <IconToolsKitchen2 size={16} color="var(--lux-gold)" />
                        {section.title}
                        <span style={{ marginLeft: "auto", color: "var(--lux-dim)", fontSize: 12, fontWeight: 400 }}>
                          {section.items.length} ürün
                        </span>
                      </summary>
                      <ul style={{ listStyle: "none", margin: 0, padding: "4px 18px 16px" }}>
                        {section.items.map((item) => (
                          <li
                            key={item.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 16,
                              padding: "10px 0",
                              borderTop: "1px solid rgba(208,197,178,0.1)",
                            }}
                          >
                            <div>
                              <span style={{ color: "var(--lux-text)", fontSize: 14, fontWeight: 500 }}>
                                {item.name}
                              </span>
                              {item.tags.length > 0 && (
                                <span style={{ marginLeft: 10, display: "inline-flex", gap: 6 }}>
                                  {item.tags.map((tag) => (
                                    <span
                                      key={tag}
                                      style={{
                                        fontSize: 10,
                                        padding: "2px 8px",
                                        borderRadius: 999,
                                        border: "1px solid rgba(212,175,55,0.35)",
                                        color: "var(--lux-gold)",
                                      }}
                                    >
                                      {tagLabels[tag] ?? tag}
                                    </span>
                                  ))}
                                </span>
                              )}
                              {item.description && (
                                <p style={{ margin: "4px 0 0", color: "var(--lux-dim)", fontSize: 13 }}>
                                  {item.description}
                                </p>
                              )}
                            </div>
                            <span style={{ color: "var(--lux-gold)", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}>
                              {formatPrice(item.priceMinor, item.currency, item.priceOnRequest)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

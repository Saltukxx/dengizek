import type { Metadata } from "next";
import Link from "next/link";
import { getPublishedHotelsForBrowse } from "@/lib/hotels-repo";
import { HotelCard, EmptyState } from "@/components/marketing";
import { amenitiesCatalog } from "@/lib/amenities-catalog";

const browseAmenities = amenitiesCatalog.flatMap((c) => c.items);

export const metadata: Metadata = {
  title: "Otelleri keşfet",
  description: "Etkileşimli video turlu otelleri filtreleyin ve bulun.",
};

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stars?: string; amenity?: string; pets?: string; price?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const minStars = sp.stars ? Number(sp.stars) : undefined;
  const amenity = sp.amenity?.trim();
  const petsOnly = sp.pets === "1";
  const priceBand = sp.price?.trim();

  let hotels = await getPublishedHotelsForBrowse();
  if (q) {
    hotels = hotels.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        (h.city ?? "").toLowerCase().includes(q) ||
        (h.country ?? "").toLowerCase().includes(q),
    );
  }
  if (minStars && minStars >= 1) {
    hotels = hotels.filter((h) => (h.starRating ?? 0) >= minStars);
  }
  if (amenity) {
    hotels = hotels.filter((h) => h.amenities.includes(amenity));
  }
  if (petsOnly) {
    hotels = hotels.filter((h) => h.petsAllowed === true);
  }
  if (priceBand === "budget") {
    hotels = hotels.filter((h) => h.minPriceMinor != null && h.minPriceMinor < 300_000);
  } else if (priceBand === "mid") {
    hotels = hotels.filter(
      (h) => h.minPriceMinor != null && h.minPriceMinor >= 300_000 && h.minPriceMinor < 800_000,
    );
  } else if (priceBand === "luxury") {
    hotels = hotels.filter((h) => h.minPriceMinor != null && h.minPriceMinor >= 800_000);
  }

  const filterParams = new URLSearchParams();
  if (sp.q) filterParams.set("q", sp.q);
  if (sp.stars) filterParams.set("stars", sp.stars);
  if (sp.amenity) filterParams.set("amenity", sp.amenity);
  if (sp.pets) filterParams.set("pets", sp.pets);
  if (sp.price) filterParams.set("price", sp.price);

  return (
    <div
      style={{
        maxWidth: 1280,
        margin: "0 auto",
        padding: "clamp(32px, 5vw, 72px) clamp(24px, 5vw, 64px)",
      }}
    >
      <div style={{ marginBottom: "clamp(32px, 4vw, 52px)" }}>
        <p
          style={{
            margin: "0 0 10px",
            fontFamily: "var(--lux-font-sans)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: "var(--lux-gold)",
          }}
        >
          Destinasyonlar
        </p>
        <h1
          style={{
            margin: "0 0 10px",
            fontFamily: "var(--lux-font-sans)",
            fontSize: "clamp(28px, 4vw, 48px)",
            fontWeight: 700,
            letterSpacing: "-0.025em",
            lineHeight: 1.1,
            color: "var(--lux-text)",
          }}
        >
          Keşfet
        </h1>
        <div style={{ width: 48, height: 2, background: "var(--lux-gold)", opacity: 0.6 }} />
      </div>

      <form method="GET" action="/browse" style={{ marginBottom: "clamp(24px, 3vw, 32px)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 480 }}>
            <input
              name="q"
              defaultValue={sp.q}
              placeholder="Şehir veya otel adı"
              className="lux-search-input"
              autoComplete="off"
            />
          </div>
          <select name="stars" defaultValue={sp.stars ?? ""} className="lux-input" style={{ minWidth: 120 }}>
            <option value="">Yıldız</option>
            {[5, 4, 3, 2, 1].map((s) => (
              <option key={s} value={s}>
                {s}+ yıldız
              </option>
            ))}
          </select>
          <select name="amenity" defaultValue={sp.amenity ?? ""} className="lux-input" style={{ minWidth: 160 }}>
            <option value="">Olanak</option>
            {browseAmenities.slice(0, 20).map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </select>
          <select name="price" defaultValue={sp.price ?? ""} className="lux-input" style={{ minWidth: 140 }}>
            <option value="">Fiyat</option>
            <option value="budget">Ekonomik (&lt; 3.000 ₺)</option>
            <option value="mid">Orta (3.000–8.000 ₺)</option>
            <option value="luxury">Lüks (8.000 ₺+)</option>
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--lux-muted)" }}>
            <input type="checkbox" name="pets" value="1" defaultChecked={petsOnly} />
            Evcil hayvan
          </label>
          <button type="submit" className="luxury-gold-button" style={{ borderRadius: 2, minHeight: 48 }}>
            Filtrele
          </button>
        </div>
      </form>

      {hotels.length === 0 ? (
        <EmptyState
          title="Eşleşen otel yok"
          description="Aramayı genişletin veya filtreleri temizleyin."
          action={
            <Link href="/browse" style={{ color: "var(--lux-gold)", textDecoration: "none", marginTop: 8 }}>
              Filtreleri temizle
            </Link>
          }
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 380px), 1fr))",
            gap: "clamp(12px, 1.5vw, 20px)",
          }}
        >
          {hotels.map((h) => (
            <HotelCard
              key={h.slug}
              hotel={{
                slug: h.slug,
                name: h.name,
                city: h.city ?? "",
                country: h.country ?? "",
                shortDescription: h.shortDescription ?? "",
                longDescription: h.longDescription ?? "",
                imageUrl: h.imageUrl ?? "",
                priceLabel: h.priceLabel ?? undefined,
                roomTypes: [],
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

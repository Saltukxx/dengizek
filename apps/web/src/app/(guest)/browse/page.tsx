import type { Metadata } from "next";
import Link from "next/link";
import { IconChevronLeft, IconChevronRight, IconMapPin, IconSearch } from "@tabler/icons-react";
import { getPublishedHotelsForBrowse } from "@/lib/hotels-repo";
import { ViewTracker } from "@/components/guest/analytics-tracker";
import { HotelCard, EmptyState } from "@/components/marketing";
import { amenitiesCatalog } from "@/lib/amenities-catalog";
import { pageWindow, paginate } from "@/lib/browse-pagination";

/** Sol panelde hızlı seçim için öne çıkarılan olanaklar. */
const FEATURED_AMENITIES = [
  { key: "acik-havuz", label: "Açık havuz" },
  { key: "spa-merkezi", label: "Spa & Wellness" },
  { key: "ozel-plaj", label: "Özel plaj" },
  { key: "her-sey-dahil", label: "Her şey dahil" },
] as const;

const PRICE_BANDS = [
  { value: "", label: "Tümü" },
  { value: "budget", label: "< 3.000 ₺" },
  { value: "mid", label: "3.000–8.000 ₺" },
  { value: "luxury", label: "8.000 ₺+" },
] as const;

const STAR_OPTIONS = [5, 4, 3] as const;

export const metadata: Metadata = {
  title: "Otelleri keşfet",
  description: "Etkileşimli video turlu otelleri filtreleyin ve bulun.",
};

type SearchParams = {
  q?: string;
  stars?: string;
  amenity?: string;
  pets?: string;
  price?: string;
  sort?: string;
  sayfa?: string;
};

/**
 * Mevcut filtreleri koruyarak tek bir parametreyi değiştiren bağlantı üretir.
 * Filtre değişince sayfa 1'e döner — aksi halde boş sayfaya düşülebilir.
 */
function hrefWith(sp: SearchParams, patch: Partial<SearchParams>): string {
  const params = new URLSearchParams();
  const resetPage = !("sayfa" in patch);
  const merged = { ...sp, ...patch, ...(resetPage ? { sayfa: undefined } : {}) };
  for (const [key, value] of Object.entries(merged)) {
    if (value) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `/browse?${qs}` : "/browse";
}


export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const minStars = sp.stars ? Number(sp.stars) : undefined;
  const amenity = sp.amenity?.trim();
  const petsOnly = sp.pets === "1";
  const priceBand = sp.price?.trim();
  const sort = sp.sort ?? "recommended";

  // Metin araması SQL'de yapılır (trigram indeksli); kalan filtreler
  // snapshot'tan türeyen alanlar üzerinde JS'te uygulanır.
  let hotels = await getPublishedHotelsForBrowse({ q });
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

  if (sort === "price-asc") {
    hotels = [...hotels].sort(
      (a, b) => (a.minPriceMinor ?? Number.MAX_SAFE_INTEGER) - (b.minPriceMinor ?? Number.MAX_SAFE_INTEGER),
    );
  } else if (sort === "rating-desc") {
    hotels = [...hotels].sort((a, b) => (b.reviewAverage ?? 0) - (a.reviewAverage ?? 0));
  }

  const hasFilters = Boolean(q || minStars || amenity || petsOnly || priceBand);

  const {
    items: pageItems,
    currentPage,
    totalPages,
    totalCount,
  } = paginate(hotels, sp.sayfa);

  return (
    <div className="er-container" style={{ paddingBlock: "clamp(20px, 3vw, 32px)" }}>
      {/* Arama/filtre görüntülemesi — panel analitiğinde talep öncesi ilgi */}
      <ViewTracker
        eventType="page_view"
        payload={{
          page: "browse",
          q: q || undefined,
          stars: minStars,
          amenity,
          price: priceBand,
          pets: petsOnly || undefined,
          sort,
          sayfa: currentPage,
          resultCount: totalCount,
        }}
      />
      {/* ── Üst arama çubuğu + sıralama ─────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: "clamp(20px, 3vw, 32px)",
        }}
      >
        <form method="GET" action="/browse" className="er-search-bar" style={{ flex: "1 1 420px" }}>
          <div className="er-input-icon" style={{ gridColumn: "span 3" }}>
            <IconMapPin size={18} className="er-icon" />
            <input
              name="q"
              defaultValue={sp.q}
              className="er-input"
              placeholder="Şehir, ülke veya otel adı"
              autoComplete="off"
              aria-label="Arama"
            />
          </div>
          {/* Aktif filtreler arama sonrasında korunur */}
          {sp.stars && <input type="hidden" name="stars" value={sp.stars} />}
          {sp.amenity && <input type="hidden" name="amenity" value={sp.amenity} />}
          {sp.price && <input type="hidden" name="price" value={sp.price} />}
          {sp.pets && <input type="hidden" name="pets" value={sp.pets} />}
          {sp.sort && <input type="hidden" name="sort" value={sp.sort} />}
          <button type="submit" className="er-btn er-btn-primary">
            <IconSearch size={18} />
            Ara
          </button>
        </form>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { value: "recommended", label: "Önerilen" },
            { value: "price-asc", label: "En düşük fiyat" },
            { value: "rating-desc", label: "En yüksek puan" },
          ].map((opt) => (
            <Link
              key={opt.value}
              href={hrefWith(sp, { sort: opt.value === "recommended" ? undefined : opt.value })}
              className="er-pill"
              data-active={sort === opt.value}
            >
              {opt.label}
            </Link>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 260px) minmax(0, 1fr)",
          gap: "clamp(20px, 3vw, 32px)",
          alignItems: "start",
        }}
        className="er-browse-grid"
      >
        {/* ── Filtre paneli ────────────────────────────────────────────── */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="er-card" style={{ padding: 20 }}>
            <h2 className="er-h3 er-display" style={{ marginBottom: 14, fontSize: 17 }}>
              Gecelik fiyat
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {PRICE_BANDS.map((band) => (
                <Link
                  key={band.value || "all"}
                  href={hrefWith(sp, { price: band.value || undefined })}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "var(--er-radius)",
                    fontSize: 14,
                    fontWeight: 600,
                    color: (priceBand ?? "") === band.value ? "var(--er-primary)" : "var(--er-text-muted)",
                    background:
                      (priceBand ?? "") === band.value ? "var(--er-primary-tint)" : "transparent",
                  }}
                >
                  {band.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="er-card" style={{ padding: 20 }}>
            <h2 className="er-h3 er-display" style={{ marginBottom: 14, fontSize: 17 }}>
              Olanaklar
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {FEATURED_AMENITIES.map((a) => {
                const active = amenity === a.key;
                return (
                  <Link
                    key={a.key}
                    href={hrefWith(sp, { amenity: active ? undefined : a.key })}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      fontSize: 14,
                      color: active ? "var(--er-primary)" : "var(--er-text-muted)",
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        border: `1px solid ${active ? "var(--er-primary)" : "var(--er-line-strong)"}`,
                        background: active ? "var(--er-primary)" : "transparent",
                        display: "grid",
                        placeItems: "center",
                        color: "#fff",
                        fontSize: 12,
                        lineHeight: 1,
                        flexShrink: 0,
                      }}
                    >
                      {active ? "✓" : ""}
                    </span>
                    {a.label}
                  </Link>
                );
              })}
              <Link
                href={hrefWith(sp, { pets: petsOnly ? undefined : "1" })}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 14,
                  color: petsOnly ? "var(--er-primary)" : "var(--er-text-muted)",
                  fontWeight: petsOnly ? 600 : 400,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    border: `1px solid ${petsOnly ? "var(--er-primary)" : "var(--er-line-strong)"}`,
                    background: petsOnly ? "var(--er-primary)" : "transparent",
                    display: "grid",
                    placeItems: "center",
                    color: "#fff",
                    fontSize: 12,
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                >
                  {petsOnly ? "✓" : ""}
                </span>
                Evcil hayvan kabul
              </Link>
            </div>

            {/* Tam katalog — panelde yer kaplamayan uzun liste */}
            <details style={{ marginTop: 14 }}>
              <summary
                style={{
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--er-primary)",
                }}
              >
                Tüm olanaklar
              </summary>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                {amenitiesCatalog.flatMap((c) => c.items).map((a) => (
                  <Link
                    key={a.key}
                    href={hrefWith(sp, { amenity: amenity === a.key ? undefined : a.key })}
                    className="er-chip"
                    style={
                      amenity === a.key
                        ? { background: "var(--er-primary-tint)", color: "var(--er-primary)" }
                        : undefined
                    }
                  >
                    {a.label}
                  </Link>
                ))}
              </div>
            </details>
          </div>

          <div className="er-card" style={{ padding: 20 }}>
            <h2 className="er-h3 er-display" style={{ marginBottom: 14, fontSize: 17 }}>
              Yıldız sayısı
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {STAR_OPTIONS.map((s) => (
                <Link
                  key={s}
                  href={hrefWith(sp, { stars: minStars === s ? undefined : String(s) })}
                  className="er-pill"
                  data-active={minStars === s}
                  style={{ minHeight: 40, justifyContent: "center", fontSize: 13, padding: "0 10px" }}
                >
                  {s} Yıldız
                </Link>
              ))}
            </div>
          </div>

          {hasFilters && (
            <Link href="/browse" className="er-btn er-btn-ghost er-btn-block">
              Filtreleri temizle
            </Link>
          )}
        </aside>

        {/* ── Sonuç listesi ─────────────────────────────────────────────── */}
        <div>
          <div className="er-section-head" style={{ marginBottom: 20 }}>
            <div>
              <h1 className="er-display er-h2">
                {q ? `“${sp.q}” için oteller` : "Video turlu oteller"}
              </h1>
              <p className="er-muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
                {totalCount} tesis bulundu
                {totalPages > 1 && ` · sayfa ${currentPage}/${totalPages}`}
              </p>
            </div>
          </div>

          {totalCount === 0 ? (
            <EmptyState
              title="Eşleşen otel yok"
              description="Aramayı genişletin veya filtreleri temizleyin."
              action={
                <Link href="/browse" className="er-btn er-btn-primary">
                  Filtreleri temizle
                </Link>
              }
            />
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
                gap: 20,
              }}
            >
              {pageItems.map((h) => (
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
                  reviewAverage={h.reviewAverage}
                  reviewCount={h.reviewCount}
                  starRating={h.starRating}
                  amenities={h.amenities}
                  minPriceMinor={h.minPriceMinor}
                />
              ))}
            </div>
          )}

          {/* ── Sayfalama ────────────────────────────────────────────────── */}
          {totalPages > 1 && (
            <nav
              aria-label="Sayfalama"
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
                marginTop: "clamp(28px, 4vw, 40px)",
              }}
            >
              <Link
                href={hrefWith(sp, { sayfa: String(Math.max(1, currentPage - 1)) })}
                className="er-pill"
                aria-label="Önceki sayfa"
                aria-disabled={currentPage === 1}
                style={{
                  minHeight: 40,
                  padding: "0 14px",
                  pointerEvents: currentPage === 1 ? "none" : undefined,
                  opacity: currentPage === 1 ? 0.45 : 1,
                }}
              >
                <IconChevronLeft size={16} />
              </Link>

              {pageWindow(currentPage, totalPages).map((p, i) =>
                p === "gap" ? (
                  <span key={`gap-${i}`} style={{ color: "var(--er-text-dim)", padding: "0 4px" }}>
                    …
                  </span>
                ) : (
                  <Link
                    key={p}
                    href={hrefWith(sp, { sayfa: p === 1 ? undefined : String(p) })}
                    className="er-pill"
                    data-active={p === currentPage}
                    aria-current={p === currentPage ? "page" : undefined}
                    style={{ minHeight: 40, padding: "0 14px", justifyContent: "center" }}
                  >
                    {p}
                  </Link>
                ),
              )}

              <Link
                href={hrefWith(sp, { sayfa: String(Math.min(totalPages, currentPage + 1)) })}
                className="er-pill"
                aria-label="Sonraki sayfa"
                aria-disabled={currentPage === totalPages}
                style={{
                  minHeight: 40,
                  padding: "0 14px",
                  pointerEvents: currentPage === totalPages ? "none" : undefined,
                  opacity: currentPage === totalPages ? 0.45 : 1,
                }}
              >
                <IconChevronRight size={16} />
              </Link>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}

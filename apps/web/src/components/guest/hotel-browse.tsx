import Link from "next/link";
import { guestPaths, isGuestSurface } from "@/lib/guest-surface";
import { IconAdjustmentsHorizontal, IconChevronLeft, IconChevronRight, IconMapPin, IconSearch, IconX } from "@tabler/icons-react";
import { getPublishedHotelsForBrowse } from "@/lib/hotels-repo";
import { ViewTracker } from "@/components/guest/analytics-tracker";
import { AssistantSearchBox } from "@/components/guest/assistant-search-box";
import { PageBanner } from "@/components/guest/page-banner";
import { SortSelect } from "@/components/guest/sort-select";
import { HotelCard, EmptyState } from "@/components/marketing";
import { amenitiesCatalog, normalizeAmenities } from "@/lib/amenities-catalog";
import { pageWindow, paginate } from "@/lib/browse-pagination";
import { StayFields } from "@/components/guest/stay-fields";
import { filterBrowseHotels } from "@/lib/browse-filters";
import { describeStay, hasStaySearch, parseStaySearch, withStayQuery } from "@/lib/stay-search";

export interface BrowseAmenityOption {
  key: string;
  label: string;
}

const PRICE_BANDS = [
  { value: "", label: "Tümü" },
  { value: "budget", label: "< 3.000 ₺" },
  { value: "mid", label: "3.000–8.000 ₺" },
  { value: "luxury", label: "8.000 ₺+" },
] as const;

const STAR_OPTIONS = [5, 4, 3] as const;

type SearchParams = {
  q?: string;
  stars?: string;
  amenity?: string;
  pets?: string;
  price?: string;
  /** "1" → yalnızca yayında video turu olan oteller. */
  tur?: string;
  /** "1" → yalnızca şu an geçerli kampanyası olan oteller. */
  kampanya?: string;
  sort?: string;
  sayfa?: string;
  /** Konaklama araması (bkz. stay-search): tarih ve kişi. */
  giris?: string;
  cikis?: string;
  yetiskin?: string;
  cocuk?: string;
};

const FILTER_KEYS = ["q", "stars", "amenity", "price", "pets", "tur", "kampanya", "sort"] as const;

/**
 * Mevcut filtreleri koruyarak tek bir parametreyi değiştiren bağlantı üretir.
 * Filtre değişince sayfa 1'e döner — aksi halde boş sayfaya düşülebilir.
 */
function buildHref(basePath: string, sp: SearchParams, patch: Partial<SearchParams>): string {
  const params = new URLSearchParams();
  const resetPage = !("sayfa" in patch);
  const merged = { ...sp, ...patch, ...(resetPage ? { sayfa: undefined } : {}) };
  for (const [key, value] of Object.entries(merged)) {
    if (value) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}


/** Banner etiketi ve açıklaması — vitrine göre. */
const BROWSE_INTROS = {
  yaz: { eyebrow: "Yaz seçkisi", lede: "Otelleri şehre, olanağa ve fiyata göre süzün; video turu olanları gitmeden gezin." },
  kis: { eyebrow: "Kış seçkisi", lede: "Yalnızca kış sezonuna seçilmiş, video turla gezilebilen tesisleri keşfedin." },
  termal: { eyebrow: "Termal seçkisi", lede: "Termal havuzu, kaplıcası ve spa’sı olan tesisleri kendi hızınızda keşfedin." },
} as const;

export interface HotelBrowseProps {
  /** Filtre bağlantılarının tabanı: "/browse", "/kis/oteller" ya da "/termal/oteller". */
  basePath: string;
  searchParams: SearchParams;
  /** Sayfa başlığı; arama yapıldığında sorgu başlığı bunun yerine geçer. */
  heading: string;
  /** Sol paneldeki hızlı olanak seçimleri — sezona göre değişir. */
  featuredAmenities: readonly BrowseAmenityOption[];
  /** "yaz" | "kis" | "termal" — verilmezse sezon süzmesi uygulanmaz. */
  season?: string;
  /** Analitik olayında hangi yüzey olduğunu ayırt etmek için. */
  analyticsPage: string;
}

/**
 * Otel listesi — yaz, kış ve termal yüzeylerinin ortak gövdesi.
 *
 * Sezon dışında yüzeyler aynı filtre setini kullanır; tasarım farkı
 * kabuktaki tema sınıfından gelir (.er-winter / .er-thermal).
 */
export async function HotelBrowse({
  basePath,
  searchParams,
  heading,
  featuredAmenities,
  season,
  analyticsPage,
}: HotelBrowseProps) {
  const sp = searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const minStars = sp.stars ? Number(sp.stars) : undefined;
  const amenity = sp.amenity?.trim();
  const petsOnly = sp.pets === "1";
  const priceBand = sp.price?.trim();
  const tourOnly = sp.tur === "1";
  const promoOnly = sp.kampanya === "1";
  const sort = sp.sort ?? "recommended";
  const stay = parseStaySearch(sp);
  const staySearched = hasStaySearch(stay);

  // Metin araması SQL'de yapılır (trigram indeksli); kalan filtreler
  // snapshot'tan türeyen alanlar üzerinde JS'te uygulanır.
  const allHotels = await getPublishedHotelsForBrowse({ q, season });
  // Aktarılan tesisler olanakları serbest metinle tutar; filtre anahtar üzerinden çalışır.
  const amenityKeysBySlug = new Map(allHotels.map((h) => [h.slug, new Set(normalizeAmenities(h.amenities))]));
  const hotels = filterBrowseHotels(allHotels, {
    q,
    minStars,
    amenity,
    petsOnly,
    priceBand,
    tourOnly,
    promoOnly,
    sort,
    stay,
  });

  const hasFilters = Boolean(q || minStars || amenity || petsOnly || priceBand || tourOnly || promoOnly || staySearched);
  const tourCount = allHotels.filter((h) => h.tourId).length;
  const promoCount = allHotels.filter((h) => h.promotionBadge).length;

  // "Tüm olanaklar" listesinde yalnızca bu sonuçlarda gerçekten bulunan katalog
  // olanakları gösterilir — sıfır sonuç veren seçenek sunulmaz.
  const presentAmenities = new Set([...amenityKeysBySlug.values()].flatMap((keys) => [...keys]));
  const catalogOptions = amenitiesCatalog
    .flatMap((c) => c.items)
    .filter((a) => presentAmenities.has(a.key) || a.key === amenity);

  const {
    items: pageItems,
    currentPage,
    totalPages,
    totalCount,
  } = paginate(hotels, sp.sayfa);

  const intro = BROWSE_INTROS[season === "kis" || season === "termal" ? season : "yaz"];

  const SORT_OPTIONS = [
    { value: "recommended", label: "Önerilen" },
    { value: "price-asc", label: "En düşük fiyat" },
    { value: "rating-desc", label: "En yüksek puan" },
  ].map((opt) => ({ ...opt, href: buildHref(basePath, sp, { sort: opt.value === "recommended" ? undefined : opt.value }) }));

  // Seçili filtreler — mobilde kaldırılabilir etiketler olarak gösterilir.
  const activeChips = [
    staySearched
      ? { label: describeStay(stay), href: buildHref(basePath, sp, { giris: undefined, cikis: undefined, yetiskin: undefined, cocuk: undefined }) }
      : null,
    sp.q ? { label: `“${sp.q}”`, href: buildHref(basePath, sp, { q: undefined }) } : null,
    priceBand ? { label: PRICE_BANDS.find((b) => b.value === priceBand)?.label ?? priceBand, href: buildHref(basePath, sp, { price: undefined }) } : null,
    amenity
      ? { label: catalogOptions.find((a) => a.key === amenity)?.label ?? featuredAmenities.find((a) => a.key === amenity)?.label ?? amenity, href: buildHref(basePath, sp, { amenity: undefined }) }
      : null,
    minStars ? { label: `${minStars}+ yıldız`, href: buildHref(basePath, sp, { stars: undefined }) } : null,
    tourOnly ? { label: "Video turu olanlar", href: buildHref(basePath, sp, { tur: undefined }) } : null,
    promoOnly ? { label: "Kampanyalı", href: buildHref(basePath, sp, { kampanya: undefined }) } : null,
    petsOnly ? { label: "Evcil hayvan", href: buildHref(basePath, sp, { pets: undefined }) } : null,
  ].filter((c): c is { label: string; href: string } => Boolean(c));
  const filterCount = activeChips.filter((c) => !c.label.startsWith("“")).length - (staySearched ? 1 : 0);

  const filterPanels = (
    <>
          <div className="er-card" style={{ padding: 20 }}>
            <h2 className="er-h3 er-display" style={{ marginBottom: 14, fontSize: 17 }}>
              Gecelik fiyat
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {PRICE_BANDS.map((band) => (
                <Link
                  key={band.value || "all"}
                  href={buildHref(basePath, sp, { price: band.value || undefined })}
                  className="er-filter-choice"
                  data-active={(priceBand ?? "") === band.value}
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
              {promoCount > 0 && (
                <Link
                  href={buildHref(basePath, sp, { kampanya: promoOnly ? undefined : "1" })}
                  className="er-filter-check"
                  data-active={promoOnly}
                >
                  <span className="er-filter-mark" data-active={promoOnly} aria-hidden>
                    {promoOnly ? "✓" : ""}
                  </span>
                  Kampanyalı oteller
                  <span className="er-filter-count">{promoCount}</span>
                </Link>
              )}
              {tourCount > 0 && (
                <Link
                  href={buildHref(basePath, sp, { tur: tourOnly ? undefined : "1" })}
                  className="er-filter-check"
                  data-active={tourOnly}
                >
                  <span className="er-filter-mark" data-active={tourOnly} aria-hidden>
                    {tourOnly ? "✓" : ""}
                  </span>
                  Video turu olanlar
                  <span className="er-filter-count">{tourCount}</span>
                </Link>
              )}
              {featuredAmenities
                .filter((a) => presentAmenities.has(a.key) || amenity === a.key)
                .map((a) => {
                const active = amenity === a.key;
                return (
                  <Link
                    key={a.key}
                    href={buildHref(basePath, sp, { amenity: active ? undefined : a.key })}
                    className="er-filter-check"
                    data-active={active}
                  >
                    <span className="er-filter-mark" data-active={active} aria-hidden>
                      {active ? "✓" : ""}
                    </span>
                    {a.label}
                  </Link>
                );
              })}
              <Link
                href={buildHref(basePath, sp, { pets: petsOnly ? undefined : "1" })}
                className="er-filter-check"
                data-active={petsOnly}
              >
                <span className="er-filter-mark" data-active={petsOnly} aria-hidden>
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
                {catalogOptions.map((a) => (
                  <Link
                    key={a.key}
                    href={buildHref(basePath, sp, { amenity: amenity === a.key ? undefined : a.key })}
                    className="er-chip"
                    data-active={amenity === a.key}
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
                  href={buildHref(basePath, sp, { stars: minStars === s ? undefined : String(s) })}
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
            <Link href={basePath} className="er-btn er-btn-ghost er-btn-block">
              Filtreleri temizle
            </Link>
          )}
    </>
  );

  return (
    <>
      <PageBanner eyebrow={intro.eyebrow} title={q ? `“${sp.q}” için oteller` : heading} lede={intro.lede}>
        <div className="pb-assistant">
          <AssistantSearchBox compact surface={season === "kis" || season === "termal" ? season : "yaz"} />
        </div>
      </PageBanner>
    <div
      className={`er-container${season === "kis" ? " er-winter-browse" : season === "termal" ? " er-thermal-browse" : ""}`}
      style={{ paddingBlock: "clamp(20px, 3vw, 32px)" }}
    >
      {/* Arama/filtre görüntülemesi — panel analitiğinde talep öncesi ilgi */}
      <ViewTracker
        eventType="page_view"
        payload={{
          page: analyticsPage,
          season,
          q: q || undefined,
          stars: minStars,
          amenity,
          price: priceBand,
          pets: petsOnly || undefined,
          tur: tourOnly || undefined,
          kampanya: promoOnly || undefined,
          sort,
          sayfa: currentPage,
          resultCount: totalCount,
          giris: stay.checkIn ?? undefined,
          kisi: stay.hasParty ? stay.adults + stay.childAges.length : undefined,
        }}
      />
      {/* ── Arama: bölge/otel + tarih + kişi, yanında sıralama ───────────── */}
      <form method="GET" action={basePath} className="er-stay-filter" aria-label="Otel ara">
        <label className="tm-stay-search-where er-stay-where">
          <span className="sf-label">
            <IconMapPin size={15} aria-hidden /> Bölge ya da otel
          </span>
          <input
            name="q"
            defaultValue={sp.q}
            className="sf-input"
            placeholder="Şehir, ülke veya otel adı"
            autoComplete="off"
            aria-label="Arama"
          />
        </label>
        <StayFields defaultValue={stay} named />
        {/* Aktif filtreler arama sonrasında korunur */}
        {FILTER_KEYS.filter((key) => key !== "q").map((key) =>
          sp[key] ? <input key={key} type="hidden" name={key} value={sp[key]} /> : null,
        )}
        <button type="submit" className="er-btn er-btn-primary">
          <IconSearch size={18} aria-hidden />
          Ara
        </button>
      </form>

      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "flex-end",
          marginBottom: "clamp(20px, 3vw, 32px)",
        }}
      >
        <div className="er-sort-pills" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {SORT_OPTIONS.map((opt) => (
            <Link key={opt.value} href={opt.href} className="er-pill" data-active={sort === opt.value}>
              {opt.label}
            </Link>
          ))}
        </div>
      </div>

      {/* ── Mobil: filtre sayfası + sıralama + seçili filtreler ─────────── */}
      <div className="er-mobile-tools">
        <details className="er-filter-sheet">
          <summary className="er-btn er-btn-ghost">
            <IconAdjustmentsHorizontal size={18} aria-hidden />
            Filtrele{filterCount ? ` (${filterCount})` : ""}
          </summary>
          <div className="er-filter-sheet-panel" role="dialog" aria-label="Filtreler">
            <p className="er-filter-sheet-title">Filtreler</p>
            {filterPanels}
          </div>
        </details>
        <SortSelect options={SORT_OPTIONS} value={sort} />
      </div>
      {activeChips.length > 0 && (
        <div className="er-active-filters" aria-label="Seçili filtreler">
          {activeChips.map((chip) => (
            <Link key={chip.href} href={chip.href} className="er-chip" data-active="true">
              {chip.label}
              <IconX size={13} aria-label="kaldır" />
            </Link>
          ))}
        </div>
      )}

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
        <aside className="er-browse-filters" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {filterPanels}
        </aside>

        {/* ── Sonuç listesi ─────────────────────────────────────────────── */}
        <div className="er-browse-results">
          <div className="er-section-head" style={{ marginBottom: 20 }}>
            <div>
              <p className="er-display er-h3" style={{ margin: 0 }}>
                {totalCount} tesis bulundu
              </p>
              {totalPages > 1 && (
                <p className="er-muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
                  Sayfa {currentPage}/{totalPages}
                </p>
              )}
            </div>
          </div>

          {totalCount === 0 ? (
            <EmptyState
              title="Eşleşen otel yok"
              description="Aramayı genişletin veya filtreleri temizleyin."
              action={
                <Link href={basePath} className="er-btn er-btn-primary">
                  Filtreleri temizle
                </Link>
              }
            />
          ) : (
            <div className="er-card-grid">
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
                  upcomingPrice={h.upcomingPrice}
                  hasTour={Boolean(h.tourId)}
                  promotionBadge={h.promotionBadge}
                  // Seçilen tarih ve kişiler otel sayfasındaki fiyat hesaplayıcıyı doldurur.
                  href={withStayQuery(
                    season && season !== "yaz" && isGuestSurface(season) ? guestPaths(season).hotel(h.slug) : `/hotels/${h.slug}`,
                    stay,
                  )}
                  // Mobilde yatay kart: fotoğraf genişliğin ~%38'i.
                  sizes="(max-width: 640px) 40vw, (max-width: 1280px) 45vw, 420px"
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
                href={buildHref(basePath, sp, { sayfa: String(Math.max(1, currentPage - 1)) })}
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
                    href={buildHref(basePath, sp, { sayfa: p === 1 ? undefined : String(p) })}
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
                href={buildHref(basePath, sp, { sayfa: String(Math.min(totalPages, currentPage + 1)) })}
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
    </>
  );
}

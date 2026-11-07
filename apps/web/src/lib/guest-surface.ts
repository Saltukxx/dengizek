// ---------------------------------------------------------------------------
// Misafir yaz/kış/termal yüzey yolları — kabuk, oda, talep ve tur aynı
// kaynağı okur.
// ---------------------------------------------------------------------------

export type GuestSurface = "yaz" | "kis" | "termal";

export const GUEST_SURFACES: readonly GuestSurface[] = ["yaz", "kis", "termal"];

/** Sezon vitrinlerinin yol önekleri ve alt yolları. Yaz kök yollarda yaşar. */
const SEASON_ROUTES = {
  kis: { home: "/kis", browse: "/kis/oteller", inquiry: "/kis/talep" },
  termal: { home: "/termal", browse: "/termal/oteller", inquiry: "/termal/talep" },
} as const;

export function isGuestSurface(value: unknown): value is GuestSurface {
  return typeof value === "string" && (GUEST_SURFACES as readonly string[]).includes(value);
}

export function guestSurfaceFromPath(path: string | null | undefined): GuestSurface {
  if (!path) return "yaz";
  for (const key of Object.keys(SEASON_ROUTES) as (keyof typeof SEASON_ROUTES)[]) {
    const home = SEASON_ROUTES[key].home;
    if (path === home || path.startsWith(`${home}/`) || path.startsWith(`${home}#`) || path.startsWith(`${home}?`)) {
      return key;
    }
  }
  return "yaz";
}

/**
 * Otelin misafir sayfası — bulunulan vitrine aitse orada kalır, değilse
 * otelin kendi vitrinine gider (termal/kış); sezonsuz ya da yazlık otel yaz
 * sayfasında açılır.
 */
export function hotelPathFor(slug: string, seasons: readonly string[] | undefined, current: GuestSurface): string {
  const list = seasons ?? [];
  if (current !== "yaz" && list.includes(current)) return guestPaths(current).hotel(slug);
  if (list.length === 0 || list.includes("yaz")) return guestPaths("yaz").hotel(slug);
  const own = (["termal", "kis"] as const).find((s) => list.includes(s));
  return guestPaths(own ?? "yaz").hotel(slug);
}

export function guestPaths(surface: GuestSurface) {
  const season = surface === "yaz" ? null : SEASON_ROUTES[surface];
  return {
    home: season?.home ?? "/",
    browse: season?.browse ?? "/browse",
    inquiry: season?.inquiry ?? "/inquiry",
    /** Yapay zekâ ile otel arama sayfası. */
    finder: season ? `${season.home}/otel-bul` : "/otel-bul",
    inquirySuccess: season ? `${season.inquiry}/basarili` : "/inquiry/success",
    hotel: (slug: string) => (season ? `${season.browse}/${slug}` : `/hotels/${slug}`),
    room: (slug: string, roomSlug: string) =>
      season ? `${season.browse}/${slug}/rooms/${roomSlug}` : `/hotels/${slug}/rooms/${roomSlug}`,
    tour: (hotelSlug: string, tourId: string, roomSlug?: string) => {
      const qs = new URLSearchParams();
      if (surface !== "yaz") qs.set("surface", surface);
      if (roomSlug) qs.set("room", roomSlug);
      const query = qs.toString();
      return `/tours/${hotelSlug}/${tourId}${query ? `?${query}` : ""}`;
    },
  };
}

// ---------------------------------------------------------------------------
// Misafir yaz/kış yüzey yolları — kabuk, oda, talep ve tur aynı kaynağı okur.
// ---------------------------------------------------------------------------

export type GuestSurface = "yaz" | "kis";

export function guestSurfaceFromPath(path: string | null | undefined): GuestSurface {
  return path?.startsWith("/kis") ? "kis" : "yaz";
}

export function guestPaths(surface: GuestSurface) {
  const winter = surface === "kis";
  return {
    home: winter ? "/kis" : "/",
    browse: winter ? "/kis/oteller" : "/browse",
    inquiry: winter ? "/kis/talep" : "/inquiry",
    hotel: (slug: string) => (winter ? `/kis/oteller/${slug}` : `/hotels/${slug}`),
    room: (slug: string, roomSlug: string) =>
      winter ? `/kis/oteller/${slug}/rooms/${roomSlug}` : `/hotels/${slug}/rooms/${roomSlug}`,
    tour: (hotelSlug: string, tourId: string, roomSlug?: string) => {
      const qs = new URLSearchParams();
      if (winter) qs.set("surface", "kis");
      if (roomSlug) qs.set("room", roomSlug);
      const query = qs.toString();
      return `/tours/${hotelSlug}/${tourId}${query ? `?${query}` : ""}`;
    },
  };
}
